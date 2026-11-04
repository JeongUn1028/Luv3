import { describe, expect, it } from "vitest";
import { toCalendarEvent, toCalendarRecord } from "@/lib/events/calendar";

describe("toCalendarEvent", () => {
  it("일정 행을 달력 값으로 바꾸고 작성자 닉네임을 붙인다", () => {
    const event = toCalendarEvent({
      id: "e1",
      date: "2026-11-14",
      start_time: "18:30:00",
      title: "저녁",
      place: "성수",
      is_together: false,
      author: { nickname: "정운" },
    });
    expect(event).toEqual({
      id: "e1",
      date: "2026-11-14",
      startTime: "18:30:00",
      title: "저녁",
      place: "성수",
      isTogether: false,
      authorNickname: "정운",
    });
  });

  it("장소·작성자가 비어 있으면 undefined로 둔다", () => {
    const event = toCalendarEvent({ id: "e1", date: "2026-11-14", start_time: null, title: "저녁", place: null, is_together: true, author: null });
    expect(event.place).toBeUndefined();
    expect(event.authorNickname).toBeUndefined();
  });
});

describe("toCalendarRecord", () => {
  it("기록 행을 달력 값으로 바꾸고 작성자 닉네임을 붙인다", () => {
    expect(toCalendarRecord({ id: "r1", date: "2026-11-02", end_date: "2026-11-04", title: "산책", author: { nickname: "진아" } })).toEqual({
      id: "r1",
      date: "2026-11-02",
      endDate: "2026-11-04",
      title: "산책",
      authorNickname: "진아",
    });
  });

  it("작성자·끝 날짜가 비어 있으면 undefined로 둔다", () => {
    const record = toCalendarRecord({ id: "r1", date: "2026-11-02", end_date: null, title: "산책", author: null });
    expect(record.authorNickname).toBeUndefined();
    expect(record.endDate).toBeUndefined();
  });
});
