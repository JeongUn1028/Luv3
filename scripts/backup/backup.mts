import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { ALBUM_BUCKET } from "../../src/lib/photos/limits.ts";
import {
  countRowsByTable,
  describeBackupVersion,
  filterDump,
  findFilesToDownload,
  formatStorageUsage,
  isInsideGitWorkTree,
  listReferencedPaths,
  toSnapshotName,
  type BackupFile,
  type BackupManifest,
} from "./lib.mts";
import {
  getLinkedConnection,
  getLocalConnection,
  listAlbumFiles,
  readCommit,
  readLastMigration,
  readLocalSizes,
  runSupabase,
  runWithLimit,
  type SupabaseConnection,
} from "./supabase.mts";

const DOWNLOAD_CONCURRENCY = 4;

const downloadFile = async (connection: SupabaseConnection, albumDirectory: string, file: BackupFile): Promise<void> => {
  const { data, error } = await connection.client.storage.from(ALBUM_BUCKET).download(file.path);
  if (error) throw new Error(`${file.path}: ${error.message}`);

  const content = Buffer.from(await data.arrayBuffer());
  if (content.length !== file.size) {
    throw new Error(`${file.path}: 크기가 다릅니다(목록 ${file.size}, 받은 파일 ${content.length})`);
  }

  // 받다 끊겨도 완성본처럼 보이지 않게, 다 쓴 뒤에 이름을 바꾼다
  const target = path.join(albumDirectory, file.path);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(`${target}.part`, content);
  await rename(`${target}.part`, target);
};

// 운영 사진과 로컬 시험 사진이 같은 album/에 섞이면 복구 때 구분할 수 없다
const assertSameSource = (root: string, source: BackupManifest["source"]): void => {
  const snapshotsDirectory = path.join(root, "snapshots");
  if (!existsSync(snapshotsDirectory)) return;

  for (const name of readdirSync(snapshotsDirectory)) {
    const manifestPath = path.join(snapshotsDirectory, name, "manifest.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as BackupManifest;
    if (manifest.source !== source) {
      throw new Error(`이 폴더에는 다른 곳(${manifest.source})에서 받은 백업이 있습니다. 폴더를 나누세요: ${root}`);
    }
  }
};

const main = async (): Promise<void> => {
  const args = process.argv.slice(2);
  const isLocal = args.includes("--local");
  const directory = args.find((arg) => !arg.startsWith("--"));

  if (!directory) throw new Error('백업 폴더를 지정하세요. 예: pnpm backup "D:\\내 드라이브\\Luv3-백업"');

  const root = path.resolve(directory);
  // 리포가 공개 상태라, 이메일·비밀번호 해시·사진이 실수로 커밋되지 않게 Git 작업 폴더 안에는 만들지 않는다
  if (isInsideGitWorkTree(root)) throw new Error(`백업 폴더는 Git 리포 밖이어야 합니다: ${root}`);

  const source = isLocal ? "local" : "linked";
  assertSameSource(root, source);

  const connection = isLocal ? getLocalConnection() : getLinkedConnection();
  console.log(`대상: ${connection.url}`);

  // 스키마가 달라 되살리지 못할 때 돌아갈 곳을 알아야 한다. 내보내기 전에 읽어 그사이 바뀐 스키마가 더 오래된 번호로 남지 않게 한다
  const commit = readCommit();
  const lastMigration = readLastMigration(connection.dumpTarget);
  console.log(describeBackupVersion({ commit, lastMigration }));

  console.log("DB 내보내는 중...");
  const dump = filterDump(
    runSupabase(["db", "dump", ...connection.dumpTarget, "--data-only", "--use-copy", "--schema", "public,auth"]),
  );
  const tables = countRowsByTable(dump);
  if (tables["auth.users"] === undefined || tables["public.dates"] === undefined) {
    throw new Error("DB 내보내기 결과에 계정이나 기록 표가 없습니다.");
  }

  const createdAt = new Date();
  const snapshotDirectory = path.join(root, "snapshots", toSnapshotName(createdAt));
  mkdirSync(snapshotDirectory, { recursive: true });
  writeFileSync(path.join(snapshotDirectory, "data.sql"), dump);

  console.log("사진 목록 확인 중...");
  const albumDirectory = path.join(root, "album");
  const files = await listAlbumFiles(connection.client);
  const toDownload = findFilesToDownload(files, readLocalSizes(albumDirectory));
  console.log(`전체 ${files.length}개 중 새로 받을 파일 ${toDownload.length}개`);

  const failures = await runWithLimit(toDownload, DOWNLOAD_CONCURRENCY, (file) =>
    downloadFile(connection, albumDirectory, file),
  );
  if (failures.length > 0) {
    throw new Error(`파일 ${failures.length}개를 받지 못했습니다. 다시 실행하면 받은 파일은 건너뜁니다.\n${failures.join("\n")}`);
  }

  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const manifest: BackupManifest = {
    createdAt: createdAt.toISOString(),
    source,
    commit,
    lastMigration,
    tables,
    files,
    totalBytes,
  };
  // 이 파일이 있어야 완성된 시점으로 치므로 맨 마지막에 쓴다
  writeFileSync(path.join(snapshotDirectory, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);

  console.log(`\n백업 완료: ${snapshotDirectory}`);
  console.table(tables);
  const usage = formatStorageUsage(files.length, totalBytes);
  console.log(usage.message);

  // 내보낸 뒤에 사진이 지워졌거나 원래 파일이 없는 행이다. 시점을 버리면 백업이 아예 없어지므로 남기고 알린다
  const listedPaths = new Set(files.map((file) => file.path));
  const unlinked = listReferencedPaths(dump).filter((filePath) => !listedPaths.has(filePath));
  if (unlinked.length > 0) {
    console.warn(`경고: 기록이 가리키는데 받지 못한 파일이 ${unlinked.length}개 있습니다. 앨범을 쓰지 않을 때 다시 받아 보고, 그래도 나오면 운영 DB를 확인하세요.\n${unlinked.join("\n")}`);
  }
  if (!commit || !lastMigration) console.warn("경고: 백업 때의 커밋이나 마지막 마이그레이션을 읽지 못해 기록에 빠졌습니다. 백업 자체는 정상입니다.");
  if (usage.isNearLimit) console.warn("경고: 무료 저장 용량의 80%를 넘었습니다. 업로드가 막히기 전에 대책을 정하세요.");
};

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
