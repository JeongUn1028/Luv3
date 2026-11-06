import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "smol-toml";
import { ALBUM_BUCKET } from "../../src/lib/photos/limits.ts";
import { compareCounts, describeBackupVersion, findLatestSnapshot, listPublicTables, toContentType, type BackupManifest } from "./lib.mts";
import { getLocalConnection, readLocalSizes, REPO_ROOT, runSupabase, runWithLimit } from "./supabase.mts";

const UPLOAD_CONCURRENCY = 4;
const MAX_PSQL_OUTPUT_BYTES = 64 * 1024 ** 2;

const MISSING_FILES_QUERY = `
select path from public.photos where path not in (select name from storage.objects where bucket_id = 'album')
union all
select thumb_path from public.photos where thumb_path not in (select name from storage.objects where bucket_id = 'album')
union all
select path from public.couple_photo where path is not null and path not in (select name from storage.objects where bucket_id = 'album');
`;

const readProjectId = (): string => {
  const config = parse(readFileSync(path.join(REPO_ROOT, "supabase/config.toml"), "utf8"));

  if (typeof config.project_id !== "string") throw new Error("supabase/config.toml에 project_id가 없습니다.");
  return config.project_id;
};

const runPsql = (container: string, input: string, extraArgs: string[] = []): string => {
  const result = spawnSync(
    "docker",
    ["exec", "-i", container, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "--single-transaction", "-q", ...extraArgs],
    { input, encoding: "utf8", maxBuffer: MAX_PSQL_OUTPUT_BYTES },
  );

  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`DB 실행에 실패했습니다.\n${result.stderr}`);
  return result.stdout;
};

const selectSnapshot = (root: string, requested: string | undefined): string => {
  const snapshotsDirectory = path.join(root, "snapshots");
  // manifest가 없는 폴더는 백업이 중간에 끊긴 시점이다
  const complete = existsSync(snapshotsDirectory)
    ? readdirSync(snapshotsDirectory).filter((name) => existsSync(path.join(snapshotsDirectory, name, "manifest.json")))
    : [];
  const snapshot = requested ?? findLatestSnapshot(complete);

  if (!snapshot || !complete.includes(snapshot)) {
    throw new Error(`되살릴 수 있는 시점이 없습니다: ${requested ?? root}\n완성된 시점: ${complete.join(", ") || "없음"}`);
  }
  return path.join(snapshotsDirectory, snapshot);
};

const readActualCounts = (container: string, tables: string[]): Record<string, number> => {
  const query = tables.map((table) => `select '${table}', count(*) from ${table}`).join(" union all ");
  const rows = runPsql(container, `${query};\n`, ["-At", "-F", "\t"]);

  return Object.fromEntries(
    rows
      .trim()
      .split("\n")
      .map((row) => {
        const [table, count] = row.split("\t");
        return [table, Number(count)];
      }),
  );
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const isConfirmed = args.includes("--yes");
  const [directory, requestedPath] = args.filter((arg) => !arg.startsWith("--"));
  // 탭 완성으로 붙는 끝 슬래시나 폴더 경로로 넘겨도 시점 이름만 쓴다
  const requestedSnapshot = requestedPath && path.basename(requestedPath);

  if (!directory) throw new Error('백업 폴더를 지정하세요. 예: pnpm backup:restore "D:\\내 드라이브\\Luv3-백업" --yes');

  const root = path.resolve(directory);
  const snapshotDirectory = selectSnapshot(root, requestedSnapshot);
  const manifest = JSON.parse(readFileSync(path.join(snapshotDirectory, "manifest.json"), "utf8")) as BackupManifest;
  console.log(`되살릴 시점: ${path.basename(snapshotDirectory)} (${manifest.source === "linked" ? "운영" : "로컬 시험"} 데이터)`);
  console.log(`백업할 때: ${describeBackupVersion(manifest)}`);

  // 로컬 DB를 지우기 전에 되살릴 수 있는 백업인지 먼저 확인한다
  const albumDirectory = path.join(root, "album");
  const localSizes = readLocalSizes(albumDirectory);
  const missing = manifest.files.filter((file) => localSizes.get(file.path) !== file.size);
  if (missing.length > 0) {
    throw new Error(`백업 폴더에 없거나 크기가 다른 파일이 ${missing.length}개 있습니다.\n${missing.map((file) => file.path).join("\n")}`);
  }

  manifest.files.forEach((file) => toContentType(file.path));

  if (!isConfirmed) {
    throw new Error("로컬 DB의 내용을 지우고 되살립니다. 계속하려면 --yes를 붙여 다시 실행하세요.");
  }

  const connection = getLocalConnection();
  const container = `supabase_db_${readProjectId()}`;

  console.log("로컬 DB 초기화 중...");
  runSupabase(["db", "reset", "--local"]);

  console.log("DB 되살리는 중...");
  const dump = readFileSync(path.join(snapshotDirectory, "data.sql"), "utf8");
  // 마이그레이션이 넣어 둔 행(couple_photo)과 부딪히지 않게 비우고 넣는다
  runPsql(container, `truncate table ${listPublicTables(dump).join(", ")} cascade;\n${dump}`);

  console.log(`사진 ${manifest.files.length}개 올리는 중...`);
  const failures = await runWithLimit(manifest.files, UPLOAD_CONCURRENCY, async (file) => {
    const { error } = await connection.client.storage
      .from(ALBUM_BUCKET)
      .upload(file.path, await readFile(path.join(albumDirectory, file.path)), {
        upsert: true,
        contentType: toContentType(file.path),
      });
    if (error) throw new Error(`${file.path}: ${error.message}`);
  });
  if (failures.length > 0) throw new Error(`파일 ${failures.length}개를 올리지 못했습니다.\n${failures.join("\n")}`);

  const expected: Record<string, number> = { ...manifest.tables, "storage.objects": manifest.files.length };
  const actual = readActualCounts(container, Object.keys(expected));
  console.table(
    Object.fromEntries(Object.keys(expected).map((name) => [name, { 원본: expected[name], 되살림: actual[name] }])),
  );

  const mismatches = compareCounts(expected, actual);
  if (mismatches.length > 0) throw new Error(`개수가 원본과 다릅니다: ${JSON.stringify(mismatches)}`);

  const missingFiles = runPsql(container, MISSING_FILES_QUERY, ["-At"]).trim();
  if (missingFiles) throw new Error(`기록이 가리키는 파일이 없습니다.\n${missingFiles}`);

  console.log("\n복구 완료: 표 행 수와 파일 수가 원본과 같고, 기록이 가리키는 파일이 모두 있습니다.");
};

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
