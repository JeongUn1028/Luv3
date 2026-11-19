import { describe, expect, it } from "vitest";
import { isObject, isUuid, splitIsoDate, UUID_PATTERN_SOURCE } from "./guards";

describe("isObject", () => {
  it("칸을 읽을 수 있는 객체면 통과한다", () => {
    expect(isObject({})).toBe(true);
    expect(isObject({ code: "E" })).toBe(true);
  });

  it("null·배열·글자·숫자는 통과하지 않는다", () => {
    expect(isObject(null)).toBe(false);
    expect(isObject([])).toBe(false);
    expect(isObject("{}")).toBe(false);
    expect(isObject(1)).toBe(false);
    expect(isObject(undefined)).toBe(false);
  });
});

describe("splitIsoDate", () => {
  it("YYYY-MM-DD를 앞자리 0을 둔 채 해·달·날로 나눈다", () => {
    expect(splitIsoDate("2026-01-05")).toEqual({ year: "2026", month: "01", day: "05" });
  });

  it("형식만 보므로 달력에 없는 날도 나눈다", () => {
    expect(splitIsoDate("2026-13-45")).toEqual({ year: "2026", month: "13", day: "45" });
  });

  it("형식이 다르면 나누지 않는다", () => {
    expect(splitIsoDate("2026-1-5")).toBeUndefined();
    expect(splitIsoDate("2026-01-05T00:00:00Z")).toBeUndefined();
    expect(splitIsoDate("")).toBeUndefined();
  });
});

describe("isUuid", () => {
  it("UUID 형식이면 대소문자와 상관없이 참이다", () => {
    expect(isUuid("5a87e560-6a6e-49be-8af3-db196468143c")).toBe(true);
    expect(isUuid("5A87E560-6A6E-49BE-8AF3-DB196468143C")).toBe(true);
  });

  // 기록·일정·할 일·댓글·사진 id가 모두 uuid 컬럼이라, 형식이 틀리면 DB에 묻지 않는다(다른 문자열은 22P02 에러). 경로에도 들어간다
  it("형식이 다르거나 뒤에 다른 글자가 붙으면 거짓이다", () => {
    expect(isUuid("not-a-uuid")).toBe(false);
    expect(isUuid("5a87e560-6a6e-49be-8af3-db196468143c/../x")).toBe(false);
    expect(isUuid("")).toBe(false);
  });
});

describe("UUID_PATTERN_SOURCE", () => {
  it("다른 정규식 안에 넣어 쓸 수 있도록 시작·끝 표시 없이 UUID 한 개를 나타낸다", () => {
    const path = new RegExp(`^${UUID_PATTERN_SOURCE}/${UUID_PATTERN_SOURCE}\\.jpg$`, "i");
    expect(path.test("5a87e560-6a6e-49be-8af3-db196468143c/6b98f671-7b7f-4acf-9b04-ec207579254d.jpg")).toBe(true);
    expect(path.test("photos/6b98f671-7b7f-4acf-9b04-ec207579254d.jpg")).toBe(false);
    expect(UUID_PATTERN_SOURCE.startsWith("^")).toBe(false);
    expect(UUID_PATTERN_SOURCE.endsWith("$")).toBe(false);
  });
});
