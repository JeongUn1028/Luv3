import { describe, expect, it } from "vitest";
import { changeDraftScope, findViewedPeriodDate, getDateAfterSave } from "./edit-scope";
import { createEmptyEventDraft, type EventDraft } from "./form";

const draft = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  ...createEmptyEventDraft("2026-11-14"),
  title: "전시 보기",
  ...overrides,
});

describe("findViewedPeriodDate", () => {
  const period = { date: "2026-10-30", end_date: "2026-11-02" };

  it("주소의 날이 기간 안이면 그날을 돌려준다", () => {
    expect(findViewedPeriodDate(period, "2026-10-30")).toBe("2026-10-30");
    expect(findViewedPeriodDate(period, "2026-11-02")).toBe("2026-11-02");
  });

  it("기간 밖이거나 틀린 값이거나 하루 일정이면 undefined를 돌려준다", () => {
    expect(findViewedPeriodDate(period, "2026-11-03")).toBeUndefined();
    expect(findViewedPeriodDate(period, "2026-02-31")).toBeUndefined();
    expect(findViewedPeriodDate(period, ["2026-11-01", "2026-11-02"])).toBeUndefined();
    expect(findViewedPeriodDate({ date: "2026-10-30", end_date: null }, "2026-10-30")).toBeUndefined();
  });
});

describe("getDateAfterSave", () => {
  it("보고 있던 날이 고친 기간 안이면 그날로 돌아간다", () => {
    expect(getDateAfterSave(draft({ date: "2026-11-14", endDate: "2026-11-16" }), { viewedDate: "2026-11-16" })).toBe("2026-11-16");
  });

  it("보고 있던 날이 기간 밖으로 밀려났으면 시작하는 날로 돌아간다", () => {
    expect(getDateAfterSave(draft({ date: "2026-11-14", endDate: "2026-11-15" }), { viewedDate: "2026-11-16" })).toBe("2026-11-14");
    expect(getDateAfterSave(draft({ date: "2026-11-14" }), { viewedDate: "2026-11-16" })).toBe("2026-11-14");
  });

  it("반복 전체를 고치면 보고 있던 날로, 이 날만 고치면 고친 날로 돌아간다", () => {
    expect(getDateAfterSave(draft({ date: "2026-11-14", scope: "all" }), { occurrenceDate: "2026-11-28" })).toBe("2026-11-28");
    expect(getDateAfterSave(draft({ date: "2026-11-21", scope: "occurrence" }), { occurrenceDate: "2026-11-28" })).toBe("2026-11-21");
  });

  it("보고 있던 날이 없으면 일정 날짜로 돌아간다", () => {
    expect(getDateAfterSave(draft({ date: "2026-11-14" }), {})).toBe("2026-11-14");
  });
});

describe("changeDraftScope", () => {
  const occurrence = { date: "2026-11-28", startDate: "2026-11-14" };

  it("전체를 고르면 시작하는 날을 채운다", () => {
    const changed = changeDraftScope({ draft: draft({ scope: "occurrence", date: "2026-11-28" }), scope: "all", occurrence, isTogether: true, scopeValues: {} });

    expect(changed.draft).toMatchObject({ scope: "all", date: "2026-11-14" });
  });

  it("이 날만을 고르면 누른 날과 반복 전체의 함께 여부로 되돌린다", () => {
    const changed = changeDraftScope({ draft: draft({ date: "2026-11-14", isTogether: false }), scope: "occurrence", occurrence, isTogether: true, scopeValues: {} });

    expect(changed.draft).toMatchObject({ scope: "occurrence", date: "2026-11-28", isTogether: true });
  });

  it("범위를 바꿔도 적어 둔 제목은 남긴다", () => {
    const changed = changeDraftScope({ draft: draft({ title: "수영" }), scope: "all", occurrence, isTogether: true, scopeValues: {} });

    expect(changed.draft.title).toBe("수영");
  });

  it("이 날만에서 옮긴 날짜는 전체에 다녀와도 되살린다", () => {
    // Arrange
    const moved = draft({ scope: "occurrence", date: "2026-11-30" });

    // Act
    const toAll = changeDraftScope({ draft: moved, scope: "all", occurrence, isTogether: true, scopeValues: {} });
    const back = changeDraftScope({ draft: toAll.draft, scope: "occurrence", occurrence, isTogether: true, scopeValues: toAll.scopeValues });

    // Assert
    expect(back.draft.date).toBe("2026-11-30");
  });

  it("전체에서 옮긴 시작 날짜도 이 날만에 다녀와도 되살린다", () => {
    // Arrange
    const moved = draft({ scope: "all", date: "2026-11-07" });

    // Act
    const toOccurrence = changeDraftScope({ draft: moved, scope: "occurrence", occurrence, isTogether: true, scopeValues: {} });
    const back = changeDraftScope({ draft: toOccurrence.draft, scope: "all", occurrence, isTogether: true, scopeValues: toOccurrence.scopeValues });

    // Assert
    expect(toOccurrence.draft.date).toBe("2026-11-28");
    expect(back.draft.date).toBe("2026-11-07");
  });

  it("전체에서 바꾼 함께 여부도 이 날만에 다녀오면 되살린다", () => {
    // Arrange
    const changedOwner = draft({ scope: "all", date: "2026-11-14", isTogether: false });

    // Act
    const toOccurrence = changeDraftScope({ draft: changedOwner, scope: "occurrence", occurrence, isTogether: true, scopeValues: {} });
    const back = changeDraftScope({ draft: toOccurrence.draft, scope: "all", occurrence, isTogether: true, scopeValues: toOccurrence.scopeValues });

    // Assert
    expect(toOccurrence.draft.isTogether).toBe(true);
    expect(back.draft.isTogether).toBe(false);
  });
});
