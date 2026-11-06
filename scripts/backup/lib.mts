import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

/** 백업에 넣는 파일 하나. 경로는 버킷 이름을 뺀 저장 경로다 */
export interface BackupFile {
  path: string;
  size: number;
}

/** 시점마다 남기는 기록. 이 파일이 있어야 그 시점의 백업이 끝까지 성공한 것이다 */
export interface BackupManifest {
  createdAt: string;
  source: "linked" | "local";
  /** 백업할 때의 리포 커밋. 스키마가 달라 되살리지 못하면 이 커밋으로 돌아간다. 이 칸을 넣기 전에 받은 시점에는 없다 */
  commit?: string;
  /** 백업한 DB에 적용된 마지막 마이그레이션. 이 칸을 넣기 전에 받은 시점에는 없다 */
  lastMigration?: string;
  tables: Record<string, number>;
  files: BackupFile[];
  totalBytes: number;
}

/** `supabase projects api-keys -o json`이 돌려주는 키 하나 */
export interface ProjectApiKey {
  name: string;
  type?: string | null;
  api_key?: string | null;
}

/** 원본과 되살린 쪽의 개수가 다른 항목 */
export interface CountMismatch {
  name: string;
  expected: number;
  actual: number;
}

// 계정을 되살리는 데 필요한 표만 남긴다. 세션·토큰처럼 민감한 표는 Supabase가 새로 추가해도 저절로 빠지도록 허용 목록으로 둔다
const KEPT_AUTH_TABLES = new Set(["users", "identities"]);
const COPY_START = /^COPY "([^"]+)"\."([^"]+)"/;
const COPY_END = "\\.";
const AUTH_SEQUENCE_LINE = /^SELECT pg_catalog\.setval\('"auth"\./;

// 기록이 파일을 가리키는 칸. 복구할 수 있는 백업인지 확인하는 데 쓴다
const FILE_PATH_COLUMNS: Record<string, string[]> = {
  "public.photos": ["path", "thumb_path"],
  "public.couple_photo": ["path"],
};
const COPY_NULL = "\\N";

const FREE_STORAGE_BYTES = 1024 ** 3;
const NEAR_LIMIT_RATIO = 0.8;
const BYTES_PER_MEGABYTE = 1024 ** 2;

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

/**
 * pg_dump 결과에서 허용하지 않은 auth 표를 지운다. 디스크에 쓰기 전에 거쳐 토큰이 파일로 남지 않게 한다.
 *
 * @example filterDump('COPY "auth"."sessions" ("id") FROM stdin;\ns1\n\\.\n') // 세션 줄이 사라진다
 */
export const filterDump = (dump: string): string => {
  const kept: string[] = [];
  let isSkipping = false;
  let isInsideCopy = false;

  for (const line of dump.split("\n")) {
    if (isInsideCopy) {
      if (!isSkipping) kept.push(line);
      if (line === COPY_END) {
        isInsideCopy = false;
        isSkipping = false;
      }
      continue;
    }

    const copy = COPY_START.exec(line);
    if (copy) {
      isInsideCopy = true;
      isSkipping = copy[1] === "auth" && !KEPT_AUTH_TABLES.has(copy[2]);
      if (!isSkipping) kept.push(line);
      continue;
    }

    if (!AUTH_SEQUENCE_LINE.test(line)) kept.push(line);
  }

  return kept.join("\n");
};

/**
 * 덤프의 표마다 행 수를 센다. COPY 형식은 내용의 줄바꿈을 `\n`으로 적으므로 한 줄이 한 행이다.
 *
 * @example countRowsByTable(dump) // { "public.dates": 6, "auth.users": 2 }
 */
export const countRowsByTable = (dump: string): Record<string, number> => {
  const counts: Record<string, number> = {};
  let current: string | undefined;

  for (const line of dump.split("\n")) {
    if (current === undefined) {
      const copy = COPY_START.exec(line);
      if (copy) {
        current = `${copy[1]}.${copy[2]}`;
        counts[current] = 0;
      }
      continue;
    }

    if (line === COPY_END) current = undefined;
    else counts[current] += 1;
  }

  return counts;
};

/**
 * 덤프에 들어 있는 public 표 이름을 돌려준다.
 *
 * @example listPublicTables(dump) // ["public.dates", "public.photos"]
 */
export const listPublicTables = (dump: string): string[] =>
  Object.keys(countRowsByTable(dump)).filter((table) => table.startsWith("public."));

/**
 * 아직 받지 않은 파일을 고른다. 경로에 uuid가 들어가 내용이 바뀌지 않으므로 크기만 비교하고, 크기가 다르면 받다 끊긴 것으로 본다.
 *
 * @example findFilesToDownload([{ path: "a.jpg", size: 1 }], new Map()) // [{ path: "a.jpg", size: 1 }]
 */
export const findFilesToDownload = (remote: BackupFile[], local: ReadonlyMap<string, number>): BackupFile[] =>
  remote.filter((file) => local.get(file.path) !== file.size);

/**
 * 저장 용량 사용량 문구를 만든다.
 *
 * @example formatStorageUsage(253, 5242880).message // "사진 파일 253개, 5.0 MB (무료 저장 용량 1GB의 0.5%)"
 */
export const formatStorageUsage = (fileCount: number, totalBytes: number): { message: string; isNearLimit: boolean } => {
  const ratio = totalBytes / FREE_STORAGE_BYTES;
  const megabytes = (totalBytes / BYTES_PER_MEGABYTE).toFixed(1);
  const percent = (ratio * 100).toFixed(1);

  return {
    message: `사진 파일 ${fileCount}개, ${megabytes} MB (무료 저장 용량 1GB의 ${percent}%)`,
    isNearLimit: ratio >= NEAR_LIMIT_RATIO,
  };
};

/**
 * 경로가 Git 작업 폴더 안이면 true를 돌려준다. 폴더가 아직 없으면 가장 가까운 상위 폴더로 판단한다.
 * 정션이나 다른 클론·워크트리도 Git이 직접 판단하므로 함께 걸러진다.
 *
 * @example isInsideGitWorkTree("G:/내 드라이브/Luv3-백업") // false
 */
export const isInsideGitWorkTree = (target: string): boolean => {
  let directory = path.resolve(target);
  while (!existsSync(directory) && path.dirname(directory) !== directory) directory = path.dirname(directory);

  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: directory, encoding: "utf8" });
  if (result.error) {
    throw new Error(`백업 폴더를 확인하지 못했습니다: ${target}\n드라이브와 폴더가 있는지, Git이 설치되어 있는지 확인하세요. (${result.error.message})`);
  }
  return result.stdout.trim() === "true";
};

/**
 * Storage 목록의 항목을 백업 파일로 바꾼다. 크기를 모르면 받은 파일을 검증할 수 없으므로 에러를 낸다.
 *
 * @example toBackupFile("a/1.jpg", 1024) // { path: "a/1.jpg", size: 1024 }
 */
export const toBackupFile = (filePath: string, size: unknown): BackupFile => {
  if (typeof size !== "number" || !Number.isFinite(size)) {
    throw new Error(`크기를 알 수 없는 파일입니다: ${filePath}`);
  }
  return { path: filePath, size };
};

/**
 * 덤프의 기록이 가리키는 파일 경로를 모은다. 비어 있는 칸은 뺀다.
 *
 * @example listReferencedPaths(dump) // ["d1/p1.jpg", "d1/p1_thumb.jpg", "couple/c1.jpg"]
 */
export const listReferencedPaths = (dump: string): string[] => {
  const paths: string[] = [];
  let columnIndexes: number[] | undefined;
  let isInsideCopy = false;

  for (const line of dump.split("\n")) {
    if (isInsideCopy) {
      if (line === COPY_END) {
        isInsideCopy = false;
        columnIndexes = undefined;
      } else if (columnIndexes) {
        const values = line.split("\t");
        for (const index of columnIndexes) if (values[index] !== COPY_NULL) paths.push(values[index]);
      }
      continue;
    }

    const copy = COPY_START.exec(line);
    if (!copy) continue;
    isInsideCopy = true;

    const pathColumns = FILE_PATH_COLUMNS[`${copy[1]}.${copy[2]}`];
    if (pathColumns) {
      const columns = /\(([^)]*)\)/.exec(line)?.[1].split(", ").map((column) => column.replaceAll('"', "")) ?? [];
      columnIndexes = pathColumns.map((column) => columns.indexOf(column));
    }
  }

  return paths;
};

/**
 * 프로젝트 키 목록에서 RLS를 넘어 모든 파일을 읽을 수 있는 키를 고른다.
 *
 * @example pickServiceKey([{ name: "service_role", api_key: "key" }]) // "key"
 */
export const pickServiceKey = (keys: ProjectApiKey[]): string => {
  const key =
    keys.find((candidate) => candidate.name === "service_role" && candidate.api_key)?.api_key ??
    keys.find((candidate) => candidate.type === "secret" && candidate.api_key)?.api_key;

  if (!key) throw new Error("프로젝트에서 서비스 키를 찾지 못했습니다. 대시보드의 API Keys 화면을 확인하세요.");
  return key;
};

/**
 * 윈도우 폴더 이름에 쓸 수 있고 이름순이 곧 시간순인 시점 이름을 만든다.
 *
 * @example toSnapshotName(new Date("2026-11-04T09:05:07Z")) // "2026-11-04T09-05-07Z"
 */
export const toSnapshotName = (date: Date): string =>
  date.toISOString().replace(/\.\d+Z$/, "Z").replaceAll(":", "-");

/**
 * 가장 늦은 시점 이름을 고른다.
 *
 * @example findLatestSnapshot(["2026-10-01T00-00-00Z", "2026-11-01T00-00-00Z"]) // "2026-11-01T00-00-00Z"
 */
export const findLatestSnapshot = (names: string[]): string | undefined => names.toSorted().at(-1);

/**
 * 파일 경로의 확장자로 업로드 형식을 정한다.
 *
 * @example toContentType("a/1.jpg") // "image/jpeg"
 */
export const toContentType = (filePath: string): string => {
  const contentType = CONTENT_TYPES[path.extname(filePath).toLowerCase()];

  if (!contentType) throw new Error(`album 버킷이 받지 않는 파일입니다: ${filePath}`);
  return contentType;
};

/**
 * 원본과 개수가 다른 항목을 돌려준다.
 *
 * @example compareCounts({ dates: 2 }, { dates: 1 }) // [{ name: "dates", expected: 2, actual: 1 }]
 */
export const compareCounts = (expected: Record<string, number>, actual: Record<string, number>): CountMismatch[] =>
  Object.entries(expected)
    .map(([name, count]) => ({ name, expected: count, actual: actual[name] ?? 0 }))
    .filter((entry) => entry.expected !== entry.actual);

const toQueryRows = (parsed: unknown): unknown[] => {
  if (Array.isArray(parsed)) return parsed;
  if (typeof parsed === "object" && parsed !== null && "rows" in parsed && Array.isArray(parsed.rows)) return parsed.rows;
  return [];
};

/**
 * `supabase db query -o json`의 출력에서 마지막 마이그레이션 번호를 읽는다. 읽지 못하면 undefined를 돌려준다.
 *
 * @example parseLastMigration('{"rows":[{"version":"20261106050000"}]}') // "20261106050000"
 */
export const parseLastMigration = (output: string): string | undefined => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output);
  } catch {
    // 형식이 달라 못 읽어도 백업 자체는 남겨야 하므로 호출한 쪽에서 경고만 한다
    return undefined;
  }

  const [row] = toQueryRows(parsed);
  if (typeof row !== "object" || row === null || !("version" in row)) return undefined;
  return typeof row.version === "string" ? row.version : undefined;
};

/**
 * 그 시점을 받을 때의 코드와 스키마 위치를 문구로 만든다.
 *
 * @example describeBackupVersion({ commit: "abc123", lastMigration: "20261106050000" }) // "커밋 abc123, 마지막 마이그레이션 20261106050000"
 */
export const describeBackupVersion = ({ commit, lastMigration }: Pick<BackupManifest, "commit" | "lastMigration">): string =>
  `커밋 ${commit ?? "기록 없음"}, 마지막 마이그레이션 ${lastMigration ?? "기록 없음"}`;
