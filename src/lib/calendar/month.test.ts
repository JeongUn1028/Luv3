import { describe, expect, it } from "vitest";
import {
  buildMonthGrid,
  formatDayHeading,
  formatEventTime,
  formatMonthTitle,
  getDefaultSelectedDate,
  getGridRange,
  groupByDate,
  parseMonth,
  shiftMonth,
} from "./month";

describe("parseMonth", () => {
  it("YYYY-MM 값은 그대로 쓰고, 없거나 틀리면 오늘(한국 날짜)이 속한 달로 본다", () => {
    expect(parseMonth("2026-12", "2026-11-02")).toBe("2026-12");
    expect(parseMonth(undefined, "2026-11-02")).toBe("2026-11");
    expect(parseMonth("2026-13", "2026-11-02")).toBe("2026-11");
    expect(parseMonth("2026-1", "2026-11-02")).toBe("2026-11");
    expect(parseMonth(["2026-12", "2027-01"], "2026-11-02")).toBe("2026-11");
  });
});

describe("shiftMonth", () => {
  it("해가 바뀌는 달 경계를 넘는다", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2027-01", -1)).toBe("2026-12");
    expect(shiftMonth("2026-11", 1)).toBe("2026-12");
  });
});

describe("buildMonthGrid", () => {
  it("일요일부터 시작하는 주로 나누고, 앞뒤 달의 날은 이번 달이 아니라고 표시한다", () => {
    // 2026-11-01은 일요일, 30일은 월요일
    const weeks = buildMonthGrid("2026-11");
    expect(weeks).toHaveLength(5);
    expect(weeks[0]?.[0]).toEqual({ date: "2026-11-01", day: 1, isCurrentMonth: true });
    expect(weeks[4]?.map(({ date }) => date)).toEqual([
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
      "2026-12-02",
      "2026-12-03",
      "2026-12-04",
      "2026-12-05",
    ]);
    expect(weeks[4]?.[2]?.isCurrentMonth).toBe(false);
  });

  it("앞달 날로 첫 주를 채우고, 6주가 필요한 달도 그린다", () => {
    // 2026-08-01은 토요일 → 첫 주에 7월 26~31일, 31일(월)까지 6주
    const weeks = buildMonthGrid("2026-08");
    expect(weeks).toHaveLength(6);
    expect(weeks[0]?.[0]).toEqual({ date: "2026-07-26", day: 26, isCurrentMonth: false });
    expect(weeks[5]?.[1]?.date).toBe("2026-08-31");
  });

  it("윤년 2월의 29일을 넣는다", () => {
    const dates = buildMonthGrid("2028-02").flat().filter(({ isCurrentMonth }) => isCurrentMonth);
    expect(dates.at(-1)?.date).toBe("2028-02-29");
    expect(dates).toHaveLength(29);
  });
});

describe("getDefaultSelectedDate", () => {
  it("보는 달에 오늘이 있으면 오늘, 없으면 그 달 1일을 고른다", () => {
    expect(getDefaultSelectedDate("2026-11", "2026-11-02")).toBe("2026-11-02");
    expect(getDefaultSelectedDate("2026-12", "2026-11-02")).toBe("2026-12-01");
  });

  it("주소로 받은 날(일정을 저장하고 돌아온 날)이 보는 달에 있으면 그날을 고른다", () => {
    expect(getDefaultSelectedDate("2026-11", "2026-11-02", "2026-11-14")).toBe("2026-11-14");
    expect(getDefaultSelectedDate("2026-11", "2026-11-02", "2026-12-14")).toBe("2026-11-02");
    expect(getDefaultSelectedDate("2026-11", "2026-11-02", ["2026-11-14"])).toBe("2026-11-02");
    expect(getDefaultSelectedDate("2026-11", "2026-11-02", "2026-11-99")).toBe("2026-11-02");
    expect(getDefaultSelectedDate("2026-11", "2026-11-02", "2026-11-31")).toBe("2026-11-02");
  });
});

describe("표기", () => {
  it("달 제목은 앨범과 같은 2026 · 11", () => {
    expect(formatMonthTitle("2026-11")).toBe("2026 · 11");
  });

  it("고른 날 제목은 11월 2일 월요일", () => {
    expect(formatDayHeading("2026-11-02")).toBe("11월 2일 월요일");
    expect(formatDayHeading("2027-01-01")).toBe("1월 1일 금요일");
  });

  it("일정 시간은 HH:MM, 시간이 없으면 종일", () => {
    expect(formatEventTime("19:30:00")).toBe("19:30");
    expect(formatEventTime(null)).toBe("종일");
  });
});

describe("getGridRange", () => {
  it("달력에 그리는 첫 칸과 마지막 칸 날짜(앞뒤 달 포함)", () => {
    expect(getGridRange("2026-11")).toEqual({ start: "2026-11-01", end: "2026-12-05" });
    expect(getGridRange("2026-08")).toEqual({ start: "2026-07-26", end: "2026-09-05" });
  });
});

describe("groupByDate", () => {
  it("날짜마다 묶고 받은 순서를 지킨다", () => {
    const grouped = groupByDate([
      { date: "2026-11-14", id: "a" },
      { date: "2026-11-15", id: "b" },
      { date: "2026-11-14", id: "c" },
    ]);
    expect(grouped.get("2026-11-14")?.map(({ id }) => id)).toEqual(["a", "c"]);
    expect(grouped.get("2026-11-15")?.map(({ id }) => id)).toEqual(["b"]);
    expect(grouped.get("2026-11-16")).toBeUndefined();
  });
});
