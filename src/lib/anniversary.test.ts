import { describe, expect, it } from "vitest";
import { ANNIVERSARY_DATE, countDaysTogether, formatSinceLabel, getAnniversaryLabel, toKstDate } from "./anniversary";

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

describe("toKstDate", () => {
  it("UTC 시각을 한국 날짜(YYYY-MM-DD)로 바꾼다", () => {
    expect(toKstDate(new Date("2026-11-01T14:59:59Z"))).toBe("2026-11-01");
    expect(toKstDate(new Date("2026-11-01T15:00:00Z"))).toBe("2026-11-02");
  });
});

describe("countDaysTogether", () => {
  it("사귄 날을 1일째로 센다", () => {
    expect(countDaysTogether("2026-10-31", "2026-10-31")).toBe(1);
    expect(countDaysTogether("2026-10-31", "2026-11-02")).toBe(3);
  });

  it("달·해가 바뀌어도 날짜 차이로 센다", () => {
    expect(countDaysTogether("2026-10-31", "2027-02-07")).toBe(100);
    expect(countDaysTogether("2026-10-31", "2027-10-31")).toBe(366);
  });

  it("기념일보다 이른 날이면 0 이하가 아니라 에러를 낸다", () => {
    expect(() => countDaysTogether("2026-10-31", "2026-10-30")).toThrow("기념일보다 이른");
  });

  it("형식이 다르면 에러를 낸다", () => {
    expect(() => countDaysTogether("2026-10-31", "2026-11-2")).toThrow("YYYY-MM-DD");
  });

  // 시안(home.svg)의 2026-11-02 = 3 DAYS와 맞춘다
  it("한국 시간 자정이 지나면 하루가 늘어난다", () => {
    expect(countDaysTogether(ANNIVERSARY_DATE, toKstDate(new Date("2026-11-01T14:59:59Z")))).toBe(2);
    expect(countDaysTogether(ANNIVERSARY_DATE, toKstDate(new Date("2026-11-01T15:00:00Z")))).toBe(3);
  });
});

describe("getAnniversaryLabel", () => {
  it("사귄 날과 해마다 돌아오는 날에 이름을 붙인다", () => {
    expect(getAnniversaryLabel("2026-10-31", "2026-10-31")).toBe("사귄 날");
    expect(getAnniversaryLabel("2026-10-31", "2027-10-31")).toBe("1주년");
    expect(getAnniversaryLabel("2026-10-31", "2036-10-31")).toBe("10주년");
    expect(getAnniversaryLabel("2026-10-31", "2144-10-31")).toBe("118주년");
  });

  it("날짜 형식이 다르면 에러를 낸다", () => {
    expect(() => getAnniversaryLabel("2026-10-31", "2027-10-31T00:00")).toThrow("YYYY-MM-DD");
    expect(() => getAnniversaryLabel("2026-10-31", "2027-1-5")).toThrow("YYYY-MM-DD");
  });

  // 기념일 기능은 하지 않기로 해서(#19) 주년만 남긴다(#74)
  it("100일 단위 날에는 이름을 붙이지 않는다", () => {
    expect(getAnniversaryLabel("2026-10-31", "2027-02-07")).toBeUndefined();
    expect(getAnniversaryLabel("2026-10-31", "2029-07-26")).toBeUndefined();
  });

  it("기념일이 아닌 날과 사귀기 전 날은 이름이 없다", () => {
    expect(getAnniversaryLabel("2026-10-31", "2026-11-02")).toBeUndefined();
    expect(getAnniversaryLabel("2026-10-31", "2027-02-08")).toBeUndefined();
    expect(getAnniversaryLabel("2026-10-31", "2025-10-31")).toBeUndefined();
  });
});
