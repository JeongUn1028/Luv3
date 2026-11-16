import { describe, expect, it } from "vitest";
import type { CalendarEvent } from "./calendar";
import type { EventDraft } from "./form";
import { canShowEventBeforeSave, findSettledPendingEventIds, mergePendingEvents, toPendingCalendarEvent, type PendingEvent } from "./pending";

const createEvent = (overrides: Partial<CalendarEvent> & Pick<CalendarEvent, "id">): CalendarEvent => ({
  date: "2026-11-20",
  repeatRule: undefined,
  period: undefined,
  startTime: null,
  title: `일정 ${overrides.id}`,
  place: undefined,
  isTogether: true,
  authorNickname: "정운",
  revision: `판 ${overrides.id}`,
  ...overrides,
});

const createPending = (overrides: Partial<PendingEvent> & Pick<PendingEvent, "id">): PendingEvent => ({
  event: createEvent({ id: overrides.id, title: `저장 중 ${overrides.id}`, revision: undefined }),
  revision: `새 판 ${overrides.id}`,
  previousRevisions: [],
  isNew: true,
  isSaved: false,
  ...overrides,
});

const createDraft = (overrides: Partial<EventDraft> = {}): EventDraft => ({
  date: "2026-11-20",
  isAllDay: false,
  startTime: "19:00",
  title: "  저녁 약속 ",
  place: " ",
  memo: "",
  isTogether: true,
  scope: "all",
  repeatRule: undefined,
  repeatUntil: "",
  endDate: undefined,
  ...overrides,
});

const toSummary = (events: ReturnType<typeof mergePendingEvents>) => events.map(({ id, date, title, isPending }) => ({ id, date, title, isPending }));

describe("canShowEventBeforeSave", () => {
  it("저장할 일정과 고치기 전 일정이 모두 하루짜리면 먼저 그린다", () => {
    expect(canShowEventBeforeSave({ draft: createDraft(), initialDraft: createDraft() })).toBe(true);
  });

  it.each([
    { name: "반복으로 저장", draft: createDraft({ repeatRule: "weekly" }), initialDraft: createDraft() },
    { name: "기간으로 저장", draft: createDraft({ endDate: "2026-11-22" }), initialDraft: createDraft() },
    { name: "반복이던 일정을 하루짜리로", draft: createDraft(), initialDraft: createDraft({ repeatRule: "monthly" }) },
    { name: "기간이던 일정을 하루짜리로", draft: createDraft(), initialDraft: createDraft({ endDate: "2026-11-21" }) },
  ])("$name 저장하면 먼저 그리지 않는다", ({ draft, initialDraft }) => {
    expect(canShowEventBeforeSave({ draft, initialDraft })).toBe(false);
  });
});

describe("toPendingCalendarEvent", () => {
  it("저장할 때처럼 앞뒤 공백을 빼고 빈 장소는 없앤 하루짜리 줄을 만든다", () => {
    expect(toPendingCalendarEvent({ id: "e1", draft: createDraft(), authorNickname: "진아" })).toEqual({
      id: "e1",
      date: "2026-11-20",
      repeatRule: undefined,
      period: undefined,
      startTime: "19:00:00",
      title: "저녁 약속",
      place: undefined,
      isTogether: true,
      authorNickname: "진아",
    });
  });

  it("종일이면 시간을 비운다", () => {
    expect(toPendingCalendarEvent({ id: "e1", draft: createDraft({ isAllDay: true, place: " 성수 " }), authorNickname: undefined })).toMatchObject({
      startTime: null,
      place: "성수",
    });
  });
});

describe("mergePendingEvents", () => {
  it("저장 중인 일정이 없으면 서버 목록을 새로 만들지 않고 그대로 돌려준다", () => {
    const events = [createEvent({ id: "a" })];

    expect(mergePendingEvents(events, [])).toBe(events);
  });

  it("새 일정은 서버 목록에 없으면 날짜·종일·시간 순서 자리에 흐리게 그린다", () => {
    // Arrange
    const events = [
      createEvent({ id: "morning", startTime: "09:00:00" }),
      createEvent({ id: "night", startTime: "21:00:00" }),
      createEvent({ id: "next-day", date: "2026-11-21" }),
    ];
    const pending = createPending({ id: "new", event: createEvent({ id: "new", startTime: "19:00:00", title: "저녁 약속" }) });

    // Act
    const shown = mergePendingEvents(events, [pending]);

    // Assert
    expect(shown.map(({ id, isPending }) => ({ id, isPending }))).toEqual([
      { id: "morning", isPending: undefined },
      { id: "new", isPending: true },
      { id: "night", isPending: undefined },
      { id: "next-day", isPending: undefined },
    ]);
  });

  it("날짜·시간을 바꾸지 않은 고치기는 같은 시간의 다른 일정 사이에서 제자리를 지킨다", () => {
    // Arrange
    const events = [createEvent({ id: "x", revision: "r1" }), createEvent({ id: "y" })];
    const pending = createPending({ id: "x", isNew: false, previousRevisions: ["r1"], event: createEvent({ id: "x", title: "고친 제목" }) });

    // Act & Assert
    expect(mergePendingEvents(events, [pending]).map(({ id }) => id)).toEqual(["x", "y"]);
  });

  it("같은 시간이면 서버 일정 뒤에 그린다(새 일정이 가장 나중에 만든 것이다)", () => {
    const shown = mergePendingEvents([createEvent({ id: "a" })], [createPending({ id: "new" })]);

    expect(shown.map(({ id }) => id)).toEqual(["a", "new"]);
  });

  it("서버 목록에 새 일정의 id가 들어오면 서버 값만 그린다", () => {
    const events = [createEvent({ id: "new", title: "서버 값" })];

    expect(toSummary(mergePendingEvents(events, [createPending({ id: "new" })]))).toEqual([
      { id: "new", date: "2026-11-20", title: "서버 값", isPending: undefined },
    ]);
  });

  it("고치는 일정은 저장이 끝나기 전이면 서버 줄을 빼고 고친 날에 고친 내용을 그리며, 이어진 기록은 서버 값을 지킨다", () => {
    // Arrange
    const events = [createEvent({ id: "e1", date: "2026-11-20", recordId: "r1", revision: "r1" })];
    const pending = createPending({ id: "e1", isNew: false, previousRevisions: ["r1"], event: createEvent({ id: "e1", date: "2026-11-25", title: "고친 일정" }) });

    // Act
    const shown = mergePendingEvents(events, [pending]);

    // Assert
    expect(toSummary(shown)).toEqual([{ id: "e1", date: "2026-11-25", title: "고친 일정", isPending: true }]);
    expect(shown[0]?.recordId).toBe("r1");
  });

  it("고치기 저장이 끝나고 서버 목록이 새 판이면 서버 값만 그린다", () => {
    const events = [createEvent({ id: "e1", revision: "새 판 e1", title: "서버 값" })];
    const pending = createPending({ id: "e1", isNew: false, isSaved: true, previousRevisions: ["r1"] });

    expect(toSummary(mergePendingEvents(events, [pending]))).toEqual([{ id: "e1", date: "2026-11-20", title: "서버 값", isPending: undefined }]);
  });

  it("다른 달에서 이 달로 옮기는 고치기는 서버 목록에 없어도 저장이 끝나기 전이면 그리고, 끝난 뒤에는 그리지 않는다", () => {
    const saving = createPending({ id: "e1", isNew: false });
    const saved = createPending({ id: "e1", isNew: false, isSaved: true });

    expect(mergePendingEvents([], [saving]).map(({ id }) => id)).toEqual(["e1"]);
    expect(mergePendingEvents([], [saved])).toEqual([]);
  });
});

describe("findSettledPendingEventIds", () => {
  it("서버 목록이 따라잡은 일정만 고른다", () => {
    // Arrange
    const events = [createEvent({ id: "new-in" }), createEvent({ id: "edit-old", revision: "r1" })];
    const pending = [
      createPending({ id: "new-in" }),
      createPending({ id: "new-out" }),
      createPending({ id: "edit-old", isNew: false, isSaved: true, previousRevisions: ["r1"] }),
    ];

    // Act & Assert
    expect(findSettledPendingEventIds(events, pending)).toEqual(["new-in"]);
  });
});
