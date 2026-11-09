import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICE_SIZE_SPECS, isAllDevicesRun } from "./devices";

const E2E_DIR = join(import.meta.dirname, "..");
const SPEC_SUFFIX = ".spec.ts";

/** e2e 아래 모든 스펙. Playwright가 하위 폴더까지 찾으므로 여기서도 하위 폴더를 본다 */
const SPEC_PATHS = readdirSync(E2E_DIR, { recursive: true, encoding: "utf8" })
  .filter((path) => path.endsWith(SPEC_SUFFIX))
  .map((path) => join(E2E_DIR, path));

const toSpecName = (path: string): string => basename(path, SPEC_SUFFIX);

describe("두 기기에서 돌리는 스펙 목록", () => {
  it("목록에 적은 이름이면 그 이름의 스펙 파일이 있다", () => {
    // 스펙 파일을 합치거나 이름을 바꾸면(#196) 목록이 아무 파일도 고르지 못한 채 조용히 넘어간다
    const specNames = SPEC_PATHS.map(toSpecName);
    const missing = DEVICE_SIZE_SPECS.filter((name) => !specNames.includes(name));

    expect(missing).toEqual([]);
  });

  it("스펙이 기기의 safeArea를 읽으면 목록에 들어 있다", () => {
    // 위 safe-area는 아이폰 17이 더 커서, 더 좁은 아이폰 15 Pro에서만 돌리면 그 기기의 값을 재지 못한다
    const listed: readonly string[] = DEVICE_SIZE_SPECS;
    const unlisted = SPEC_PATHS.filter((path) => /\bsafeArea\b/.test(readFileSync(path, "utf8")))
      .map(toSpecName)
      .filter((name) => !listed.includes(name));

    expect(unlisted).toEqual([]);
  });
});

describe("isAllDevicesRun", () => {
  it("E2E_ALL_DEVICES가 1이면 두 기기 전체를 돌린다", () => {
    expect(isAllDevicesRun("1")).toBe(true);
  });

  it("E2E_ALL_DEVICES가 없거나 1이 아니면 나눠 돌린다", () => {
    expect(isAllDevicesRun(undefined)).toBe(false);
    expect(isAllDevicesRun("")).toBe(false);
    expect(isAllDevicesRun("true")).toBe(false);
  });
});
