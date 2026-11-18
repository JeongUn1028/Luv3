// 백업 시점의 기록(manifest.json)을 읽는다(#359). 되살리기는 이 목록대로 로컬 DB를 지우고 파일을 올리므로,
// 손으로 고쳤거나 깨진 기록을 그대로 믿지 않고 모양을 먼저 확인한다
import { isObject } from "../../src/lib/guards.ts";
import type { BackupFile, BackupManifest } from "./lib.mts";

const fail = (field: string, reason: string): never => {
  throw new Error(`백업 기록(manifest.json)의 ${field}이 ${reason}`);
};

const isCount = (value: unknown): value is number => typeof value === "number" && Number.isInteger(value) && value >= 0;

const readOptionalText = (record: Record<string, unknown>, field: "commit" | "lastMigration"): string | undefined => {
  const value = record[field];
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : fail(field, "글자가 아닙니다");
};

// 표 이름은 되살린 뒤 개수를 셀 때 SQL에 그대로 들어가므로 이름 모양만 받는다(예: dates, public.photos)
const TABLE_NAME = /^[a-z_][a-z0-9_]*(\.[a-z_][a-z0-9_]*)?$/;

const readTables = (value: unknown): Record<string, number> => {
  if (!isObject(value)) return fail("tables", "객체가 아닙니다");
  return Object.fromEntries(
    Object.entries(value).map(([name, count]) => {
      if (!TABLE_NAME.test(name)) return fail(`tables의 이름 '${name}'`, "표 이름 모양이 아닙니다");
      return [name, isCount(count) ? count : fail(`tables.${name}`, "0 이상의 정수가 아닙니다")];
    }),
  );
};

const readFiles = (value: unknown): BackupFile[] => {
  if (!Array.isArray(value)) return fail("files", "배열이 아닙니다");
  return value.map((file: unknown, index): BackupFile => {
    if (!isObject(file)) return fail(`files[${index}]`, "객체가 아닙니다");
    const { path, size } = file;
    if (typeof path !== "string" || path === "") return fail(`files[${index}].path`, "비어 있거나 글자가 아닙니다");
    if (!isCount(size)) return fail(`files[${index}].size`, "0 이상의 정수가 아닙니다");
    return { path, size };
  });
};

/**
 * manifest.json의 글을 읽어 모양을 확인한다. 맞지 않으면 어느 칸이 왜 틀렸는지 알리고 멈춘다.
 * commit·lastMigration은 그 칸을 넣기 전에 받은 시점에는 없어 없어도 받는다.
 *
 * @example const manifest = parseBackupManifest(readFileSync(path.join(snapshotDirectory, "manifest.json"), "utf8"));
 */
export const parseBackupManifest = (text: string): BackupManifest => {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    throw new Error("백업 기록(manifest.json)이 JSON이 아닙니다", { cause: error });
  }
  if (!isObject(value)) return fail("내용", "객체가 아닙니다");
  const { createdAt, source, totalBytes } = value;
  if (typeof createdAt !== "string" || createdAt === "") return fail("createdAt", "비어 있거나 글자가 아닙니다");
  if (source !== "linked" && source !== "local") return fail("source", "linked·local이 아닙니다");
  if (!isCount(totalBytes)) return fail("totalBytes", "0 이상의 정수가 아닙니다");
  const commit = readOptionalText(value, "commit");
  const lastMigration = readOptionalText(value, "lastMigration");
  return {
    createdAt,
    source,
    ...(commit === undefined ? {} : { commit }),
    ...(lastMigration === undefined ? {} : { lastMigration }),
    tables: readTables(value.tables),
    files: readFiles(value.files),
    totalBytes,
  };
};
