import { describe, expect, it } from "vitest";
import { ANNIVERSARY_DATE, formatSinceLabel } from "./anniversary";

describe("formatSinceLabel", () => {
  it("YYYY-MM-DD를 SINCE YYMMDD로 바꾼다", () => {
    expect(formatSinceLabel("2026-10-31")).toBe("SINCE 261031");
    expect(formatSinceLabel("2027-01-05")).toBe("SINCE 270105");
  });

  it("형식이 다르면 에러를 낸다", () => {
    expect(() => formatSinceLabel("2026-1-5")).toThrow("YYYY-MM-DD");
    expect(() => formatSinceLabel("261031")).toThrow("YYYY-MM-DD");
  });

  // 앱 아이콘·공유 이미지에는 날짜가 이미지로 새겨져 있어, 기념일을 바꾸면 이미지도 다시 만들어야 한다
  it("기념일 표기가 앱 아이콘·공유 이미지에 새긴 날짜와 같다", () => {
    expect(formatSinceLabel(ANNIVERSARY_DATE)).toBe("SINCE 261031");
  });
});
