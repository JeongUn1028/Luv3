import { describe, expect, it } from "vitest";
import { isObject, splitIsoDate } from "./guards";

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
