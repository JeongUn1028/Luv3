import { describe, expect, it } from "vitest";
import { describeUpcomingDay, pickUpcomingDay } from "./upcoming";

const event = (id: string, date: string, startTime: string | null) => ({ id, date, startTime });

describe("pickUpcomingDay", () => {
  it("오늘 일정이 있으면 지난 시간 일정까지 오늘 일정을 모두 고른다", () => {
    // Arrange
    const events = [
      event("어제", "2026-11-02", "19:00:00"),
      event("오늘 아침", "2026-11-03", "08:00:00"),
      event("오늘 저녁", "2026-11-03", "19:00:00"),
      event("다음 날", "2026-11-04", null),
    ];

    // Act
    const day = pickUpcomingDay(events, "2026-11-03");

    // Assert
    expect(day?.date).toBe("2026-11-03");
    expect(day?.isToday).toBe(true);
    expect(day?.events.map(({ id }) => id)).toEqual(["오늘 아침", "오늘 저녁"]);
  });

  it("오늘 일정이 없으면 가장 가까운 다음 날의 일정을 모두 고른다", () => {
    const events = [
      event("먼 날", "2026-11-20", null),
      event("가까운 날 1", "2026-11-14", "12:00:00"),
      event("지난 날", "2026-11-01", null),
      event("가까운 날 2", "2026-11-14", "18:00:00"),
    ];

    const day = pickUpcomingDay(events, "2026-11-03");

    expect(day?.date).toBe("2026-11-14");
    expect(day?.isToday).toBe(false);
    expect(day?.events.map(({ id }) => id)).toEqual(["가까운 날 1", "가까운 날 2"]);
  });

  it("같은 날 안에서는 종일 일정을 먼저, 시간 일정은 이른 시간부터 놓고 같은 시간은 받은 순서를 지킨다", () => {
    const events = [
      event("저녁", "2026-11-03", "19:30:00"),
      event("점심 1", "2026-11-03", "12:00:00"),
      event("종일 1", "2026-11-03", null),
      event("점심 2", "2026-11-03", "12:00:00"),
      event("종일 2", "2026-11-03", null),
    ];

    const day = pickUpcomingDay(events, "2026-11-03");

    expect(day?.events.map(({ id }) => id)).toEqual(["종일 1", "종일 2", "점심 1", "점심 2", "저녁"]);
  });

  it("오늘과 그 뒤에 일정이 없으면 undefined를 돌려준다", () => {
    expect(pickUpcomingDay([event("지난 날", "2026-11-02", null)], "2026-11-03")).toBeUndefined();
    expect(pickUpcomingDay([], "2026-11-03")).toBeUndefined();
  });
});

describe("describeUpcomingDay", () => {
  it("오늘이면 제목은 오늘 일정, 설명은 오늘 날짜다", () => {
    expect(describeUpcomingDay("2026-11-03", "2026-11-03")).toEqual({
      title: "오늘 일정",
      detail: "11월 3일 화요일",
    });
  });

  it("내일이면 날짜 뒤에 내일을 붙인다", () => {
    expect(describeUpcomingDay("2026-11-04", "2026-11-03")).toEqual({
      title: "다음 일정",
      detail: "11월 4일 수요일 · 내일",
    });
  });

  it("이틀 뒤부터는 며칠 뒤인지 붙이고, 달·해가 바뀌어도 날 수를 센다", () => {
    expect(describeUpcomingDay("2026-11-14", "2026-11-03").detail).toBe("11월 14일 토요일 · 11일 뒤");
    expect(describeUpcomingDay("2027-01-02", "2026-12-31").detail).toBe("1월 2일 토요일 · 2일 뒤");
  });
});
