import { describe, expect, it } from "vitest";
import { expandEventRows, expandUpcomingEventRows, formatRepeatRule, listOccurrenceDates, toEventEditHref } from "./recurrence";
import type { CalendarEventRow } from "./calendar";

const series = { date: "2026-11-06", repeatUntil: null, exceptionDates: [] };

const createRow = (overrides: Partial<CalendarEventRow>): CalendarEventRow => ({
  id: "e1",
  date: "2026-11-06",
  start_time: null,
  title: "운동",
  place: null,
  is_together: true,
  repeat_rule: null,
  repeat_until: null,
  created_at: "2026-11-01T00:00:00+00:00",
  author: { nickname: "정운" },
  exceptions: [],
  ...overrides,
});

describe("listOccurrenceDates", () => {
  it("매주 반복은 범위 안의 같은 요일을 모두 돌려준다", () => {
    expect(listOccurrenceDates({ ...series, repeatRule: "weekly" }, { start: "2026-11-10", end: "2026-11-30" })).toEqual([
      "2026-11-13",
      "2026-11-20",
      "2026-11-27",
    ]);
  });

  it("매달 반복은 달이 바뀌어도 같은 날을 돌려준다", () => {
    expect(listOccurrenceDates({ ...series, repeatRule: "monthly" }, { start: "2026-12-01", end: "2027-02-28" })).toEqual([
      "2026-12-06",
      "2027-01-06",
      "2027-02-06",
    ]);
  });

  it("그 달에 없는 날이면 마지막 날로 옮기고 다음 달은 원래 날로 돌아온다", () => {
    expect(
      listOccurrenceDates({ ...series, date: "2027-01-31", repeatRule: "monthly" }, { start: "2027-01-01", end: "2027-04-30" }),
    ).toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });

  it("윤년 2월의 매달 일정은 그해 2월 29일에 온다", () => {
    expect(
      listOccurrenceDates({ ...series, date: "2028-01-31", repeatRule: "monthly" }, { start: "2028-02-01", end: "2028-02-29" }),
    ).toEqual(["2028-02-29"]);
  });

  it("2월 29일의 매년 일정은 평년에 2월 28일로 옮기고 윤년에 돌아온다", () => {
    expect(
      listOccurrenceDates({ ...series, date: "2028-02-29", repeatRule: "yearly" }, { start: "2028-01-01", end: "2032-12-31" }),
    ).toEqual(["2028-02-29", "2029-02-28", "2030-02-28", "2031-02-28", "2032-02-29"]);
  });

  it("시작일 앞 범위에는 나오지 않는다", () => {
    expect(listOccurrenceDates({ ...series, repeatRule: "weekly" }, { start: "2026-10-01", end: "2026-11-05" })).toEqual([]);
  });

  it("끝나는 날까지만 돌려주고 그날은 포함한다", () => {
    expect(
      listOccurrenceDates({ ...series, repeatRule: "weekly", repeatUntil: "2026-11-20" }, { start: "2026-11-01", end: "2026-12-31" }),
    ).toEqual(["2026-11-06", "2026-11-13", "2026-11-20"]);
  });

  it("건너뛰는 날은 뺀다", () => {
    expect(
      listOccurrenceDates(
        { ...series, repeatRule: "weekly", exceptionDates: ["2026-11-13"] },
        { start: "2026-11-01", end: "2026-11-20" },
      ),
    ).toEqual(["2026-11-06", "2026-11-20"]);
  });
});

describe("expandEventRows", () => {
  const range = { start: "2026-11-01", end: "2026-11-30" };

  it("반복 일정은 날마다 한 줄씩 펼치고 반복 규칙을 남긴다", () => {
    const events = expandEventRows([createRow({ repeat_rule: "weekly" })], range);

    expect(events.map(({ date }) => date)).toEqual(["2026-11-06", "2026-11-13", "2026-11-20", "2026-11-27"]);
    expect(events[1]).toMatchObject({ id: "e1", title: "운동", repeatRule: "weekly", isTogether: true, authorNickname: "정운" });
  });

  it("반복하지 않는 일정은 그대로 한 줄이다", () => {
    expect(expandEventRows([createRow({})], range)).toMatchObject([{ date: "2026-11-06", repeatRule: undefined }]);
  });

  it("건너뛰는 날은 펼치지 않는다", () => {
    const events = expandEventRows([createRow({ repeat_rule: "weekly", exceptions: [{ date: "2026-11-13" }] })], range);

    expect(events.map(({ date }) => date)).toEqual(["2026-11-06", "2026-11-20", "2026-11-27"]);
  });

  it("날짜 → 종일 먼저 → 시간 → 만든 순서로 정렬한다", () => {
    const events = expandEventRows(
      [
        createRow({ id: "later", date: "2026-11-07", start_time: "09:00:00" }),
        createRow({ id: "second", date: "2026-11-06", start_time: "09:00:00", created_at: "2026-11-02T00:00:00+00:00" }),
        createRow({ id: "first", date: "2026-11-06", start_time: "09:00:00", created_at: "2026-11-01T00:00:00+00:00" }),
        createRow({ id: "allDay", date: "2026-11-06" }),
      ],
      range,
    );

    expect(events.map(({ id }) => id)).toEqual(["allDay", "first", "second", "later"]);
  });

  it("범위 밖의 반복하지 않는 일정은 뺀다", () => {
    expect(expandEventRows([createRow({ date: "2026-12-01" })], range)).toEqual([]);
  });
});

describe("expandUpcomingEventRows", () => {
  const today = "2026-11-06";

  it("가장 가까운 날까지만 펼쳐 그날 일정만 돌려준다", () => {
    // Arrange
    const rows = [
      createRow({ id: "weekly", date: "2026-10-13", repeat_rule: "weekly" }),
      createRow({ id: "single", date: "2026-11-09" }),
      createRow({ id: "far", date: "2040-01-01" }),
    ];

    // Act
    const events = expandUpcomingEventRows(rows, today);

    // Assert
    expect(events.map(({ id, date }) => [id, date])).toEqual([["single", "2026-11-09"]]);
  });

  it("오늘 오는 반복 일정과 한 번짜리 일정을 함께 돌려준다", () => {
    // Arrange
    const rows = [createRow({ id: "weekly", date: "2026-10-30", repeat_rule: "weekly" }), createRow({ id: "single", date: today })];

    // Act
    const events = expandUpcomingEventRows(rows, today);

    // Assert
    expect(events.map(({ id, date }) => [id, date]).toSorted()).toEqual([
      ["single", today],
      ["weekly", today],
    ]);
  });

  it("1년보다 뒤에 시작하는 반복 일정도 돌려준다", () => {
    // Act
    const events = expandUpcomingEventRows([createRow({ date: "2030-03-01", repeat_rule: "weekly" })], today);

    // Assert
    expect(events.map(({ date }) => date)).toEqual(["2030-03-01"]);
  });

  it("매년 일정의 다음 날을 건너뛰면 그다음 해의 날을 돌려준다", () => {
    // Arrange
    const row = createRow({ date: "2020-12-25", repeat_rule: "yearly", exceptions: [{ date: "2026-12-25" }] });

    // Act
    const events = expandUpcomingEventRows([row], today);

    // Assert
    expect(events.map(({ date }) => date)).toEqual(["2027-12-25"]);
  });

  it("끝난 반복 일정과 지난 한 번짜리 일정만 있으면 빈 목록을 돌려준다", () => {
    // Arrange
    const rows = [
      createRow({ id: "ended", date: "2026-01-02", repeat_rule: "weekly", repeat_until: "2026-11-05" }),
      createRow({ id: "past", date: "2026-11-05" }),
    ];

    // Act & Assert
    expect(expandUpcomingEventRows(rows, today)).toEqual([]);
  });
});

describe("toEventEditHref", () => {
  it("반복 일정은 어느 날을 눌렀는지 주소에 담는다", () => {
    expect(toEventEditHref({ id: "e1", date: "2026-11-13", repeatRule: "weekly" })).toBe("/events/e1/edit?date=2026-11-13");
  });

  it("반복하지 않는 일정은 날짜를 담지 않는다", () => {
    expect(toEventEditHref({ id: "e1", date: "2026-11-13", repeatRule: undefined })).toBe("/events/e1/edit");
  });
});

describe("formatRepeatRule", () => {
  it.each([
    ["weekly", "매주"],
    ["monthly", "매달"],
    ["yearly", "매년"],
  ] as const)("%s는 %s로 보여 준다", (rule, label) => {
    expect(formatRepeatRule(rule)).toBe(label);
  });
});
