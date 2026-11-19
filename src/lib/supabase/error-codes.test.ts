import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DB_ERROR_CODE } from "./error-codes";

const MIGRATIONS_DIR = new URL("../../../supabase/migrations/", import.meta.url);
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith(".sql"))
  .map((name) => readFileSync(new URL(name, MIGRATIONS_DIR), "utf8"))
  .join("\n");

describe("DB_ERROR_CODE", () => {
  // 앱이 정한 P04xx는 마이그레이션의 raise에만 있어, 오타가 나면 화면이 그 거절을 못 알아본다.
  // 마이그레이션은 쌓이기만 해서 나중에 코드를 바꾼 것은 잡지 못한다
  it.each(Object.entries(DB_ERROR_CODE).filter(([, code]) => code.startsWith("P04")))("%s(%s)를 마이그레이션의 DB 함수가 낸다", (_, code) => {
    expect(migrations).toContain(`errcode = '${code}'`);
  });

  it("코드끼리 겹치지 않는다", () => {
    const codes = Object.values(DB_ERROR_CODE);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
