import { describe, expect, it } from "vitest";
import { formatTodoEventChip, getTodoEventLastDay, shouldAskTodoEventDone } from "./event-chip";
import type { TodoEvent } from "./list";

const event = (overrides: Partial<TodoEvent> = {}): TodoEvent => ({
  id: "e1",
  date: "2026-11-23",
  endDate: undefined,
  isTogether: true,
  authorNickname: "정운",
  notYetDate: undefined,
  ...overrides,
});

describe("formatTodoEventChip", () => {
  it("오늘이거나 앞으로의 일정이면 날짜·요일과 누구 일정인지 보여 준다", () => {
    expect(formatTodoEventChip(event(), "2026-11-19")).toEqual({ label: "11월 23일 월 · 함께", isPast: false });
    expect(formatTodoEventChip(event(), "2026-11-23")).toEqual({ label: "11월 23일 월 · 함께", isPast: false });
  });

  it("한 사람 일정이면 작성자 닉네임을, 작성자를 모르면 내 이름으로 대신하지 않는다", () => {
    expect(formatTodoEventChip(event({ isTogether: false }), "2026-11-19").label).toBe("11월 23일 월 · 정운");
    expect(formatTodoEventChip(event({ isTogether: false, authorNickname: undefined }), "2026-11-19").label).toBe("11월 23일 월 · 한 사람");
  });

  it("일정 날짜가 지나면 지났다고 보여 준다", () => {
    expect(formatTodoEventChip(event(), "2026-11-24")).toEqual({ label: "11월 23일 지남", isPast: true });
  });

  it("기간 일정은 시작일로 쓰고, 끝 날짜까지는 지나지 않은 것으로 본다", () => {
    const period = event({ endDate: "2026-11-25" });

    expect(formatTodoEventChip(period, "2026-11-25")).toEqual({ label: "11월 23일 월 · 함께", isPast: false });
    expect(formatTodoEventChip(period, "2026-11-26")).toEqual({ label: "11월 23일 지남", isPast: true });
  });
});

describe("getTodoEventLastDay", () => {
  it("하루 일정은 그날, 기간 일정은 끝 날짜가 마지막 날이다", () => {
    expect(getTodoEventLastDay(event())).toBe("2026-11-23");
    expect(getTodoEventLastDay(event({ endDate: "2026-11-25" }))).toBe("2026-11-25");
  });
});

describe("shouldAskTodoEventDone", () => {
  it("일정의 마지막 날이 지나면 다녀왔는지 묻는다", () => {
    expect(shouldAskTodoEventDone(event(), "2026-11-24")).toBe(true);
  });

  it("마지막 날이 오늘이거나 앞으로면 묻지 않는다", () => {
    expect(shouldAskTodoEventDone(event(), "2026-11-23")).toBe(false);
    expect(shouldAskTodoEventDone(event({ endDate: "2026-11-25" }), "2026-11-25")).toBe(false);
  });

  it("그 마지막 날에 [아직]을 눌렀으면 묻지 않는다", () => {
    expect(shouldAskTodoEventDone(event({ notYetDate: "2026-11-23" }), "2026-11-24")).toBe(false);
  });

  it("[아직]을 누른 뒤 일정을 미뤄 마지막 날이 달라졌으면, 미룬 날짜가 지났을 때 다시 묻는다", () => {
    const postponed = event({ date: "2026-11-30", notYetDate: "2026-11-23" });

    expect(shouldAskTodoEventDone(postponed, "2026-11-30")).toBe(false);
    expect(shouldAskTodoEventDone(postponed, "2026-12-01")).toBe(true);
  });
});
