import { describe, expect, it } from "vitest";
import { findLinkedRecordId, formatEventOwner, toCalendarEvent, toCalendarRecord } from "@/lib/events/calendar";

describe("toCalendarEvent", () => {
  it("일정 행을 달력 값으로 바꾸고 작성자 닉네임을 붙인다", () => {
    const event = toCalendarEvent({
      id: "e1",
      date: "2026-11-14",
      start_time: "18:30:00",
      title: "저녁",
      place: "성수",
      is_together: false,
      repeat_rule: null,
      repeat_until: null,
      end_date: null,
      created_at: "2026-11-01T00:00:00+00:00",
      author: { nickname: "정운" },
      exceptions: [],
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
    const event = toCalendarEvent({ id: "e1", date: "2026-11-14", start_time: null, title: "저녁", place: null, is_together: true, repeat_rule: null, repeat_until: null, end_date: null, created_at: "2026-11-01T00:00:00+00:00", author: null, exceptions: [] });
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

describe("findLinkedRecordId", () => {
  const records = [
    { id: "r1", event_date: "2026-11-06" },
    { id: "r2", event_date: "2026-11-13" },
  ];

  it("반복 일정은 그날에 이어진 기록만 찾는다", () => {
    const swim = { date: "2026-11-06", repeat_rule: "weekly", records };
    expect([findLinkedRecordId(swim, "2026-11-13"), findLinkedRecordId(swim, "2026-11-20")]).toEqual(["r2", undefined]);
  });

  // 반복이 아닌 일정은 날짜를 고쳐도 같은 일이라 남긴 기록을 그대로 잇는다
  it("반복이 아닌 일정은 시작일의 기록을 먼저, 없으면 이어진 아무 기록이나 찾는다", () => {
    expect(findLinkedRecordId({ date: "2026-11-13", repeat_rule: null, records }, "2026-11-13")).toBe("r2");
    expect(findLinkedRecordId({ date: "2026-11-20", repeat_rule: null, records }, "2026-11-20")).toBe("r1");
  });

  it("반복을 꺼 여러 기록과 이어진 일정은 시작일의 기록이 없으면 가장 이른 날의 기록을 찾는다", () => {
    expect(findLinkedRecordId({ date: "2026-11-20", repeat_rule: null, records: [...records].reverse() }, "2026-11-20")).toBe("r1");
  });

  it("이어진 기록을 읽지 않았거나 없으면 찾지 않는다", () => {
    expect(findLinkedRecordId({ date: "2026-11-06", repeat_rule: null }, "2026-11-06")).toBeUndefined();
    expect(findLinkedRecordId({ date: "2026-11-06", repeat_rule: null, records: [] }, "2026-11-06")).toBeUndefined();
  });
});
