import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { describe, expect, it } from "vitest";
import { DEVICE_SIZE_SPECS, isAllDevicesRun, SHARED_DATA_SPECS, SPEC_SUFFIX } from "./devices";
import { listSpecPaths } from "./spec-files";

const SPEC_PATHS = listSpecPaths();

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

describe("맨 마지막에 따로 돌리는 공유 데이터 스펙 목록", () => {
  it("목록에 적은 이름이면 그 이름의 스펙 파일이 있다", () => {
    const specNames = SPEC_PATHS.map(toSpecName);
    const missing = SHARED_DATA_SPECS.filter((name) => !specNames.includes(name));

    expect(missing).toEqual([]);
  });

  it("커플 사진을 실제로 바꾸는 스펙이면 목록에 들어 있다", () => {
    // 목록에서 빠지면 기기 프로젝트에서 다른 스펙과 나란히 돌아, 커플 사진을 읽는 스펙이 가끔 깨진다
    const listed: readonly string[] = SHARED_DATA_SPECS;
    const unlisted = SPEC_PATHS.filter((path) => readFileSync(path, "utf8").includes("switchToE2eCouplePhoto"))
      .map(toSpecName)
      .filter((name) => !listed.includes(name));

    expect(unlisted).toEqual([]);
  });

  it("두 기기에서 돌리는 스펙 목록과 겹치지 않는다", () => {
    // 공유 데이터 스펙은 기기 프로젝트에서 빼고 스펙 안에서 두 기기를 차례로 돈다
    const sizeSpecs: readonly string[] = DEVICE_SIZE_SPECS;

    expect(SHARED_DATA_SPECS.filter((name) => sizeSpecs.includes(name))).toEqual([]);
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
