import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { listAlbumObjects } from "../../src/lib/photos/album-files.ts";
import { ALBUM_BUCKET } from "../../src/lib/photos/limits.ts";
import { parseLastMigration, pickServiceKey, toBackupFile, type BackupFile, type ProjectApiKey } from "./lib.mts";

export const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

/** 백업·복구에 쓸 Supabase 접속 정보. 서비스 키는 메모리에만 두고 파일이나 화면에 남기지 않는다 */
export interface SupabaseConnection {
  url: string;
  client: SupabaseClient;
  dumpTarget: string[];
}

const CLI_PATH = path.join(REPO_ROOT, "node_modules/supabase/dist/supabase.js");
// 글자만 담긴 덤프라 이 크기를 넘을 일은 없다. 넘으면 잘린 파일을 남기지 않고 실패한다
const MAX_DUMP_BYTES = 512 * 1024 ** 2;
const LAST_MIGRATION_QUERY = "select max(version) as version from supabase_migrations.schema_migrations";

/**
 * Supabase CLI를 실행하고 표준 출력을 돌려준다. 셸을 거치지 않아 인자를 따옴표로 감쌀 일이 없다.
 *
 * @example runSupabase(["status", "-o", "env"])
 */
export const runSupabase = (args: string[]): string => {
  const result = spawnSync(process.execPath, [CLI_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: MAX_DUMP_BYTES,
    stdio: ["inherit", "pipe", "inherit"],
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`supabase ${args.slice(0, 2).join(" ")} 실행에 실패했습니다(종료 코드 ${result.status}).`);
  }
  return result.stdout;
};

/**
 * 지금 리포의 커밋을 돌려준다. 읽지 못하면 undefined를 돌려준다.
 *
 * @example readCommit() // "eb7445f..."
 */
export const readCommit = (): string | undefined => {
  const result = spawnSync("git", ["rev-parse", "HEAD"], { cwd: REPO_ROOT, encoding: "utf8" });
  const commit = result.stdout?.trim();
  return result.status === 0 && commit ? commit : undefined;
};

/**
 * 접속한 DB에 적용된 마지막 마이그레이션을 돌려준다. 기록용 값이라 읽지 못해도 백업을 멈추지 않고 undefined를 돌려준다.
 *
 * @example readLastMigration(["--linked"]) // "20261106050000"
 */
export const readLastMigration = (dumpTarget: string[]): string | undefined => {
  try {
    return parseLastMigration(runSupabase(["db", "query", ...dumpTarget, "-o", "json", LAST_MIGRATION_QUERY]));
  } catch {
    return undefined;
  }
};

const toClient = (url: string, serviceKey: string): SupabaseClient =>
  createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const readStatusValue = (status: string, key: string): string => {
  const value = new RegExp(`^${key}="?([^"\\r\\n]+)"?`, "m").exec(status)?.[1];

  if (!value) throw new Error(`로컬 Supabase 상태에서 ${key}를 찾지 못했습니다. pnpm db:start로 먼저 실행하세요.`);
  return value;
};

/**
 * 로컬 Supabase에 접속한다. 주소가 내 컴퓨터가 아니면 복구가 운영 데이터를 지울 수 있으므로 에러를 낸다.
 *
 * @example const { client } = getLocalConnection();
 */
export const getLocalConnection = (): SupabaseConnection => {
  const status = runSupabase(["status", "-o", "env"]);
  const url = readStatusValue(status, "API_URL");

  if (!["127.0.0.1", "localhost"].includes(new URL(url).hostname)) {
    throw new Error(`로컬 주소가 아니므로 멈춥니다: ${url}`);
  }
  return { url, client: toClient(url, readStatusValue(status, "SERVICE_ROLE_KEY")), dumpTarget: ["--local"] };
};

/**
 * `supabase link`로 연결한 운영 프로젝트에 접속한다. 키는 `supabase login` 상태로 그때그때 받아 입력할 값이 없다.
 *
 * @example const { client } = getLinkedConnection();
 */
export const getLinkedConnection = (): SupabaseConnection => {
  const refPath = path.join(REPO_ROOT, "supabase/.temp/project-ref");

  if (!existsSync(refPath)) {
    throw new Error("연결된 프로젝트가 없습니다. 원본 클론에서 실행하거나 pnpm exec supabase link --project-ref <ref>를 먼저 실행하세요.");
  }

  const ref = readFileSync(refPath, "utf8").trim();
  const output = runSupabase(["projects", "api-keys", "--project-ref", ref, "--reveal", "-o", "json"]);
  const url = `https://${ref}.supabase.co`;

  return { url, client: toClient(url, pickServiceKey(JSON.parse(output) as ProjectApiKey[])), dumpTarget: ["--linked"] };
};

/**
 * album 버킷의 파일을 폴더까지 따라가며 모두 나열한다.
 *
 * @example const files = await listAlbumFiles(client);
 */
export const listAlbumFiles = async (client: SupabaseClient): Promise<BackupFile[]> =>
  (await listAlbumObjects(client.storage.from(ALBUM_BUCKET))).map((file) => toBackupFile(file.path, file.size));

/**
 * 폴더 아래 파일의 크기를 `/`로 구분한 상대 경로 기준으로 돌려준다. 폴더가 없으면 비어 있다.
 *
 * @example readLocalSizes("D:/backup/album").get("a/1.jpg") // 1024
 */
export const readLocalSizes = (directory: string): Map<string, number> => {
  const sizes = new Map<string, number>();
  if (!existsSync(directory)) return sizes;

  for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const filePath = path.join(entry.parentPath, entry.name);
    sizes.set(path.relative(directory, filePath).replaceAll(path.sep, "/"), statSync(filePath).size);
  }
  return sizes;
};

/**
 * 항목마다 작업을 동시에 몇 개씩만 돌리고 실패는 모아서 돌려준다. 다시 실행하면 받은 파일을 건너뛰므로 하나가 실패해도 나머지를 마저 처리한다.
 *
 * @example const failures = await runWithLimit(files, 4, downloadFile);
 */
export const runWithLimit = async <Item,>(
  items: Item[],
  limit: number,
  task: (item: Item) => Promise<void>,
): Promise<string[]> => {
  const failures: string[] = [];
  let next = 0;

  const work = async (): Promise<void> => {
    while (next < items.length) {
      const item = items[next];
      next += 1;
      await task(item).catch((error: unknown) => {
        failures.push(error instanceof Error ? error.message : String(error));
      });
    }
  };

  await Promise.all(Array.from({ length: limit }, work));
  return failures;
};
