import { describe, expect, it } from "vitest";
import { getEditEventRecordLink, getEventRecordLink, toEventRecordHref, toEventRecordPrefill, type EventRecordPrefillRow } from "./record-link";

const today = "2026-11-09";

describe("getEventRecordLink", () => {
  const walk = { date: "2026-11-01", repeatRule: undefined, period: undefined, isTogether: true, recordId: undefined };

  it("이어진 기록이 있으면 그 기록을 보여 준다", () => {
    expect(getEventRecordLink({ ...walk, recordId: "r1" }, today)).toEqual({ kind: "view", recordId: "r1" });
  });

  // 일정을 함께에서 한 사람으로 바꾸거나 날짜를 뒤로 옮겨도 이미 남긴 기록은 열 수 있어야 한다
  it("이어진 기록이 있으면 한 사람 일정이거나 앞으로의 일정이어도 보여 준다", () => {
    expect(getEventRecordLink({ ...walk, isTogether: false, date: "2026-12-01", recordId: "r1" }, today)).toEqual({ kind: "view", recordId: "r1" });
  });

  it("기록이 없으면 오늘까지의 함께 일정에만 남기기를 권한다", () => {
    expect(getEventRecordLink(walk, today)).toEqual({ kind: "leave", eventDate: "2026-11-01" });
    expect(getEventRecordLink({ ...walk, date: today }, today)).toEqual({ kind: "leave", eventDate: today });
    expect(getEventRecordLink({ ...walk, date: "2026-11-10" }, today)).toBeUndefined();
    expect(getEventRecordLink({ ...walk, isTogether: false }, today)).toBeUndefined();
  });

  it("반복 일정은 그날을, 기간 일정은 어느 날에서 눌러도 시작일을 연결 날짜로 쓴다", () => {
    expect(getEventRecordLink({ ...walk, date: "2026-11-06", repeatRule: "weekly" }, today)).toEqual({ kind: "leave", eventDate: "2026-11-06" });
    const trip = { ...walk, period: { start: "2026-10-30", end: "2026-11-01" } };
    expect(getEventRecordLink({ ...trip, date: "2026-10-31" }, today)).toEqual({ kind: "leave", eventDate: "2026-10-30" });
  });

  it("기간 일정은 끝나는 날부터 남기기를 권한다", () => {
    const trip = { ...walk, date: "2026-11-08", period: { start: "2026-11-08", end: "2026-11-10" } };
    expect(getEventRecordLink(trip, today)).toBeUndefined();
    expect(getEventRecordLink(trip, "2026-11-10")).toEqual({ kind: "leave", eventDate: "2026-11-08" });
  });
});

describe("getEditEventRecordLink", () => {
  const swim = { date: "2026-10-07", repeat_rule: "weekly", end_date: null, is_together: true, records: [{ id: "r1", event_date: "2026-10-14" }] };

  it("반복 일정은 고치는 날의 기록을 보거나 그날로 남긴다", () => {
    expect(getEditEventRecordLink(swim, "2026-10-14", today)).toEqual({ kind: "view", recordId: "r1" });
    expect(getEditEventRecordLink(swim, "2026-10-21", today)).toEqual({ kind: "leave", eventDate: "2026-10-21" });
  });

  it("반복 일정을 날 없이 열면 버튼을 보여 주지 않는다", () => {
    expect(getEditEventRecordLink(swim, undefined, today)).toBeUndefined();
  });

  it("기간 일정은 시작일로 남긴다", () => {
    const trip = { date: "2026-10-30", repeat_rule: null, end_date: "2026-11-01", is_together: true, records: [] };
    expect(getEditEventRecordLink(trip, undefined, today)).toEqual({ kind: "leave", eventDate: "2026-10-30" });
  });
});

describe("toEventRecordHref", () => {
  it("이어진 기록은 상세로, 남길 기록은 일정 id와 날짜를 넘긴 작성 화면으로 간다", () => {
    expect(toEventRecordHref("e1", { kind: "view", recordId: "r1" })).toBe("/dates/r1");
    expect(toEventRecordHref("e1", { kind: "leave", eventDate: "2026-11-01" })).toBe("/dates/new?event=e1&eventDate=2026-11-01");
  });
});

describe("toEventRecordPrefill", () => {
  const row: EventRecordPrefillRow = {
    id: "e1",
    date: "2026-11-01",
    title: "전시",
    place: "국립현대미술관",
    memo: "도슨트 2시",
    is_together: true,
    repeat_rule: null,
    repeat_until: null,
    end_date: null,
    exceptions: [],
  };

  it("일정의 날짜·제목·장소·메모를 채우고 일정과 잇는다", () => {
    expect(toEventRecordPrefill(row, "2026-11-01", today)).toEqual({
      date: "2026-11-01",
      endDate: undefined,
      title: "전시",
      place: "국립현대미술관",
      memo: "도슨트 2시",
      eventLink: { eventId: "e1", eventDate: "2026-11-01" },
    });
  });

  it("비어 있는 장소·메모는 빈 글자로 채운다", () => {
    expect(toEventRecordPrefill({ ...row, place: null, memo: null }, "2026-11-01", today)).toMatchObject({ place: "", memo: "" });
  });

  it("기간 일정은 끝 날짜까지 채운다", () => {
    expect(toEventRecordPrefill({ ...row, end_date: "2026-11-03" }, "2026-11-01", today)).toMatchObject({ date: "2026-11-01", endDate: "2026-11-03" });
  });

  it("반복 일정은 실제로 오는 날만 받는다", () => {
    const swim = { ...row, date: "2026-10-07", repeat_rule: "weekly", exceptions: [{ date: "2026-10-14" }] };
    expect(toEventRecordPrefill(swim, "2026-10-21", today)).toMatchObject({ date: "2026-10-21", eventLink: { eventId: "e1", eventDate: "2026-10-21" } });
    expect(toEventRecordPrefill(swim, "2026-10-14", today)).toBeUndefined();
    expect(toEventRecordPrefill(swim, "2026-10-22", today)).toBeUndefined();
  });

  // 작성 화면 주소는 손으로 바꿀 수 있다. 맞지 않으면 연결 없이 쓰게 한다
  it("일정과 날짜가 맞지 않거나, 한 사람 일정이거나, 아직 끝나지 않았으면 채우지 않는다", () => {
    expect(toEventRecordPrefill(row, "2026-11-02", today)).toBeUndefined();
    expect(toEventRecordPrefill({ ...row, is_together: false }, "2026-11-01", today)).toBeUndefined();
    expect(toEventRecordPrefill({ ...row, date: "2026-11-10" }, "2026-11-10", today)).toBeUndefined();
    expect(toEventRecordPrefill({ ...row, end_date: "2026-11-10" }, "2026-11-01", today)).toBeUndefined();
  });

  it("기록 칸보다 긴 제목·장소는 칸 길이까지만 채운다", () => {
    const prefill = toEventRecordPrefill({ ...row, title: "가".repeat(120), place: "나".repeat(120) }, "2026-11-01", today);
    expect([prefill?.title.length, prefill?.place.length]).toEqual([100, 100]);
  });
});
