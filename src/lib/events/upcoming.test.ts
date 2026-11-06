import { describe, expect, it } from "vitest";
import { formatEventMeta, formatEventOwner, formatUpcomingDay, previewUpcomingEvents } from "./upcoming";

const event = (id: string, date: string) => ({ id, date });

describe("formatUpcomingDay", () => {
  it("오늘과 내일은 말로 쓴다", () => {
    expect(formatUpcomingDay("2026-11-03", "2026-11-03")).toBe("오늘");
    expect(formatUpcomingDay("2026-11-04", "2026-11-03")).toBe("내일");
  });

  it("이틀 뒤부터는 며칠 뒤인지 쓰고, 달·해가 바뀌어도 날 수를 센다", () => {
    expect(formatUpcomingDay("2026-11-14", "2026-11-03")).toBe("11일 뒤");
    expect(formatUpcomingDay("2027-01-02", "2026-12-31")).toBe("2일 뒤");
  });
});

describe("previewUpcomingEvents", () => {
  it("일정이 2개 이하면 모두 보여 주고 외 N개 문구는 없다", () => {
    expect(previewUpcomingEvents([])).toEqual({ shown: [], moreLabel: undefined });
    const one = [event("전시", "2026-11-03")];
    expect(previewUpcomingEvents(one)).toEqual({ shown: one, moreLabel: undefined });
    const two = [event("전시", "2026-11-03"), event("저녁", "2026-11-04")];
    expect(previewUpcomingEvents(two)).toEqual({ shown: two, moreLabel: undefined });
  });

  it("같은 날 일정이 3개면 앞의 2개를 보여 주고 외 1개라고 쓴다", () => {
    const events = [event("전시", "2026-11-03"), event("저녁", "2026-11-03"), event("영화", "2026-11-03")];

    expect(previewUpcomingEvents(events)).toEqual({ shown: events.slice(0, 2), moreLabel: "외 1개" });
  });

  it("보여 준 마지막 날에 못 넣은 일정만 센다", () => {
    const events = [
      event("오늘", "2026-11-03"),
      event("내일 1", "2026-11-04"),
      event("내일 2", "2026-11-04"),
      event("내일 3", "2026-11-04"),
      event("먼 날", "2026-11-20"),
    ];

    expect(previewUpcomingEvents(events).moreLabel).toBe("외 2개");
  });

  it("더 먼 날의 일정은 세지 않는다", () => {
    const events = [event("오늘", "2026-11-03"), event("내일", "2026-11-04"), event("먼 날", "2026-11-20")];

    expect(previewUpcomingEvents(events).moreLabel).toBeUndefined();
  });
});

describe("formatEventMeta", () => {
  it("시간과 장소를 가운뎃점으로 잇는다", () => {
    expect(formatEventMeta({ startTime: "19:00:00", place: "성수" })).toBe("19:00 · 성수");
  });

  it("시간이 없으면 종일이라고 쓴다", () => {
    expect(formatEventMeta({ startTime: null, place: "국립현대미술관" })).toBe("종일 · 국립현대미술관");
  });

  it("장소가 없으면 시간만 쓴다", () => {
    expect(formatEventMeta({ startTime: "19:00:00", place: undefined })).toBe("19:00");
    expect(formatEventMeta({ startTime: null, place: undefined })).toBe("종일");
  });

  it("기간 일정은 시간 대신 기간을 쓴다", () => {
    const period = { start: "2026-10-30", end: "2026-11-01" };
    expect(formatEventMeta({ startTime: "10:00:00", place: "제주", period })).toBe("10.30–11.01 · 제주");
    expect(formatEventMeta({ startTime: null, place: undefined, period })).toBe("10.30–11.01");
  });
});

describe("formatEventOwner", () => {
  it("함께 일정이면 작성자와 상관없이 함께라고 쓴다", () => {
    expect(formatEventOwner({ isTogether: true, authorNickname: "진아" })).toBe("함께");
  });

  it("한 사람 일정이면 작성자 닉네임을 쓴다", () => {
    expect(formatEventOwner({ isTogether: false, authorNickname: "정운" })).toBe("정운");
  });

  it("한 사람 일정인데 작성자를 모르면 한 사람이라고 쓴다", () => {
    expect(formatEventOwner({ isTogether: false, authorNickname: undefined })).toBe("한 사람");
  });
});
