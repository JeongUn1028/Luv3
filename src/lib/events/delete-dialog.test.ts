import { describe, expect, it } from "vitest";
import { toEventDeleteDialog } from "./delete-dialog";
import { createEmptyEventDraft, type EventDraft } from "./form";

const draft = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  ...createEmptyEventDraft("2026-11-02"),
  title: "전시 보기",
  ...overrides,
});

describe("toEventDeleteDialog", () => {
  it("반복 중 하루를 지우면 그날만 지워진다고 알린다", () => {
    // Arrange
    const repeating = draft({ repeatRule: "weekly" });

    // Act
    const dialog = toEventDeleteDialog(repeating, "2026-11-09");

    // Assert
    expect(dialog).toEqual({
      title: "이 날 일정을 지울까요?",
      description: '"전시 보기" 일정의 11월 9일 월요일 하루만 두 사람 캘린더에서 지워져요.',
    });
  });

  it("반복 일정 전체를 지우면 따로 고친 날도 함께 지워진다고 알린다", () => {
    expect(toEventDeleteDialog(draft({ repeatRule: "weekly" }), undefined)).toEqual({
      title: "반복 일정 전체를 지울까요?",
      description: '"전시 보기" 일정의 모든 날이 두 사람 캘린더에서 지워져요. 따로 고친 날도 함께 지워져요.',
    });
  });

  it("기간 일정을 지우면 기간을 함께 알린다", () => {
    expect(toEventDeleteDialog(draft({ date: "2026-10-30", endDate: "2026-11-01" }), undefined)).toEqual({
      title: "기간 일정을 지울까요?",
      description: '"전시 보기" 일정의 10.30–11.01 모든 날이 두 사람 캘린더에서 지워져요.',
    });
  });

  it("하루 일정을 지우면 그 일정이 지워진다고 알린다", () => {
    expect(toEventDeleteDialog(draft(), undefined)).toEqual({
      title: "이 일정을 지울까요?",
      description: '"전시 보기" 일정이 두 사람 캘린더에서 모두 지워져요.',
    });
  });
});
