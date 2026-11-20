import { describe, expect, it, vi } from "vitest";
import type { SaveErrorCode } from "@/lib/save-outcome";
import { createFakeRevisionedTable } from "@/test-utils/revisioned-table";
import { createEmptyEventDraft, type EventDraft, type EventValues } from "./form";
import { deleteEvent, saveEvent, type DeletableEvents, type EventExceptions } from "./save";

const EVENT_ID = "20000000-0000-4000-8000-000000000001";
const NEW_EVENT_ID = "20000000-0000-4000-8000-000000000002";
const NO_UPDATED_ROWS = [{ data: [], error: null }];
// 응답이 끊겨 처리됐는지 모르는 오류(fetch 실패는 코드가 비어 있다)
const LOST_RESPONSE = { code: "" };

const createDraft = (fields: Partial<EventDraft> = {}): EventDraft => ({ ...createEmptyEventDraft("2026-11-20"), title: "  영화 보기 ", ...fields });

/** detach_event_occurrence가 차례로 돌려줄 오류. 다 쓰면 성공한다 */
const createDetachOccurrence = (errors: (SaveErrorCode | null)[] = []) => vi.fn(async () => ({ error: errors.shift() ?? null }));

const saveWith = ({ draft = createDraft(), eventId, occurrenceDate, events = createFakeRevisionedTable<EventValues>().table, detachOccurrence = createDetachOccurrence() }: {
  draft?: EventDraft;
  eventId?: string;
  occurrenceDate?: string;
  events?: ReturnType<typeof createFakeRevisionedTable<EventValues>>["table"];
  detachOccurrence?: ReturnType<typeof createDetachOccurrence>;
} = {}) => saveEvent({ events, detachOccurrence, draft, eventId, occurrenceDate, newEventId: NEW_EVENT_ID, revision: "r2" });

describe("saveEvent", () => {
  it("새 일정은 정리한 값과 새 id·이번 판 번호로 만들고, 성공하면 실패 내용이 없다", async () => {
    // Arrange
    const { table, calls } = createFakeRevisionedTable<EventValues>();

    // Act
    const failure = await saveWith({ events: table });

    // Assert
    expect(failure).toBeUndefined();
    expect(calls.insert).toEqual([expect.objectContaining({ id: NEW_EVENT_ID, revision: "r2", title: "영화 보기", date: "2026-11-20" })]);
  });

  it("고칠 일정은 불러온 판과 이번 판일 때만 고친다", async () => {
    // Arrange
    const { table, calls } = createFakeRevisionedTable<EventValues>();

    // Act
    await saveWith({ events: table, eventId: EVENT_ID, draft: createDraft({ expectedRevisions: ["r1"] }) });

    // Assert
    expect(calls.update).toEqual([expect.objectContaining({ id: EVENT_ID, revisions: ["r1", "r2"] })]);
  });

  it("고치는 사이 상대가 고쳤으면 최신 내용을 불러오게 하는 실패 내용을 돌려준다", async () => {
    const { table } = createFakeRevisionedTable<EventValues>({ updateResults: NO_UPDATED_ROWS });

    const failure = await saveWith({ events: table, eventId: EVENT_ID });

    expect(failure).toMatchObject({ hasConflict: true, isGone: false, message: "그사이 바뀌어 저장 못 했어요. 불러오면 쓴 내용은 사라져요." });
  });

  it("고칠 일정이 그사이 지워졌으면 캘린더에서 확인하라고 알린다", async () => {
    const { table } = createFakeRevisionedTable<EventValues>({ updateResults: NO_UPDATED_ROWS, isRowThere: false });

    const failure = await saveWith({ events: table, eventId: EVENT_ID });

    expect(failure).toMatchObject({ isGone: true, message: "이 일정은 이미 지워졌어요. 캘린더에서 다시 확인해 주세요." });
  });

  it("범위가 이 날만이면 표를 고치지 않고 그날과 새 id·허용 판 번호로 detach_event_occurrence를 부른다", async () => {
    // Arrange
    const { table, calls } = createFakeRevisionedTable<EventValues>();
    const detachOccurrence = createDetachOccurrence();
    const draft = createDraft({ scope: "occurrence", isAllDay: false, startTime: "19:30", place: " 극장 ", expectedRevisions: ["r1"] });

    // Act
    const failure = await saveWith({ events: table, detachOccurrence, draft, eventId: EVENT_ID, occurrenceDate: "2026-11-13" });

    // Assert
    expect(failure).toBeUndefined();
    expect(calls.update).toEqual([]);
    expect(detachOccurrence).toHaveBeenCalledWith({
      p_event_id: EVENT_ID,
      p_occurrence_date: "2026-11-13",
      p_date: "2026-11-20",
      p_title: "영화 보기",
      p_start_time: "19:30",
      p_place: "극장",
      p_memo: undefined,
      p_expected_revisions: ["r1"],
      p_new_event_id: NEW_EVENT_ID,
    });
  });

  it("이 날만 고칠 고를 날이 없으면 일정 전체를 고친다", async () => {
    const { table, calls } = createFakeRevisionedTable<EventValues>();
    const detachOccurrence = createDetachOccurrence();

    await saveWith({ events: table, detachOccurrence, draft: createDraft({ scope: "occurrence" }), eventId: EVENT_ID });

    expect(detachOccurrence).not.toHaveBeenCalled();
    expect(calls.update).toHaveLength(1);
  });

  it("이 날만 고치다 응답이 끊기면 한 번 더 보내고, 다시 보내 성공하면 실패 내용이 없다", async () => {
    const detachOccurrence = createDetachOccurrence([LOST_RESPONSE]);

    const failure = await saveWith({ detachOccurrence, draft: createDraft({ scope: "occurrence" }), eventId: EVENT_ID, occurrenceDate: "2026-11-13" });

    expect(detachOccurrence).toHaveBeenCalledTimes(2);
    expect(failure).toBeUndefined();
  });

  it("이 날만 고치다 반복 일정이 그사이 바뀌어 거부되면(P0409) 최신 내용을 불러오게 한다", async () => {
    const failure = await saveWith({ detachOccurrence: createDetachOccurrence([{ code: "P0409" }]), draft: createDraft({ scope: "occurrence" }), eventId: EVENT_ID, occurrenceDate: "2026-11-13" });

    expect(failure).toMatchObject({ hasConflict: true });
  });

  it("이 날만 고치다 그날이 없으면(P0002) 이미 고쳤거나 지웠다고 알린다", async () => {
    const failure = await saveWith({ detachOccurrence: createDetachOccurrence([{ code: "P0002" }]), draft: createDraft({ scope: "occurrence" }), eventId: EVENT_ID, occurrenceDate: "2026-11-13" });

    expect(failure).toMatchObject({ isGone: true, message: "이 날 일정은 이미 고쳤거나 지웠어요. 캘린더에서 다시 확인해 주세요." });
  });

  it("이 날만 고치다 거절이 분명한 오류면 다시 보내지 않고 저장되지 않았다고 알린다", async () => {
    const detachOccurrence = createDetachOccurrence([{ code: "42501" }]);

    const failure = await saveWith({ detachOccurrence, draft: createDraft({ scope: "occurrence" }), eventId: EVENT_ID, occurrenceDate: "2026-11-13" });

    expect(detachOccurrence).toHaveBeenCalledTimes(1);
    expect(failure).toMatchObject({ mayHaveSaved: false, message: "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요." });
  });

  it("이 날만 고치다 두 번 다 응답이 끊기면 저장됐을 수 있다고 알린다", async () => {
    const failure = await saveWith({ detachOccurrence: createDetachOccurrence([LOST_RESPONSE, LOST_RESPONSE]), draft: createDraft({ scope: "occurrence" }), eventId: EVENT_ID, occurrenceDate: "2026-11-13" });

    expect(failure).toMatchObject({ mayHaveSaved: true });
  });
});

describe("saveEvent 하고 싶은 것에 일정 잡기(#471·#495)", () => {
  const TODO_ID = "40000000-0000-4000-8000-000000000001";

  /** schedule_todos가 차례로 돌려줄 오류. 다 쓰면 성공한다 */
  const createScheduleTodo = (errors: (SaveErrorCode | null)[] = []) => vi.fn(async () => ({ error: errors.shift() ?? null }));

  const scheduleWith = ({ draft = createDraft(), scheduleTodo = createScheduleTodo(), events = createFakeRevisionedTable<EventValues>().table }: {
    draft?: EventDraft;
    scheduleTodo?: ReturnType<typeof createScheduleTodo>;
    events?: ReturnType<typeof createFakeRevisionedTable<EventValues>>["table"];
  } = {}) =>
    saveEvent({
      events,
      detachOccurrence: createDetachOccurrence(),
      todoSchedule: { todoIds: [TODO_ID], scheduleTodos: scheduleTodo },
      draft,
      eventId: undefined,
      occurrenceDate: undefined,
      newEventId: NEW_EVENT_ID,
      revision: "r2",
    });

  it("표에 바로 만들지 않고 정리한 값과 새 id·이번 판 번호로 schedule_todos를 불러 일정을 만들며 잇는다", async () => {
    // Arrange
    const { table, calls } = createFakeRevisionedTable<EventValues>();
    const scheduleTodo = createScheduleTodo();
    const draft = createDraft({ isAllDay: false, startTime: "19:30", place: " 극장 ", endDate: "2026-11-21" });

    // Act
    const failure = await scheduleWith({ draft, scheduleTodo, events: table });

    // Assert
    expect(failure).toBeUndefined();
    expect(calls.insert).toEqual([]);
    expect(scheduleTodo).toHaveBeenCalledWith({
      p_todo_ids: [TODO_ID],
      p_event_id: NEW_EVENT_ID,
      p_revision: "r2",
      p_date: "2026-11-20",
      p_title: "영화 보기",
      p_is_together: true,
      p_start_time: "19:30",
      p_end_date: "2026-11-21",
      p_place: "극장",
      p_memo: undefined,
      p_expected_revisions: [],
    });
  });

  it("하고 싶은 것 여럿에 잡으면 고른 순서대로 모두 보낸다(#495)", async () => {
    const scheduleTodos = createScheduleTodo();
    const otherTodoId = "40000000-0000-4000-8000-000000000002";

    await saveEvent({
      events: createFakeRevisionedTable<EventValues>().table,
      detachOccurrence: createDetachOccurrence(),
      todoSchedule: { todoIds: [TODO_ID, otherTodoId], scheduleTodos },
      draft: createDraft(),
      eventId: undefined,
      occurrenceDate: undefined,
      newEventId: NEW_EVENT_ID,
      revision: "r2",
    });

    expect(scheduleTodos).toHaveBeenCalledWith(expect.objectContaining({ p_todo_ids: [TODO_ID, otherTodoId], p_event_id: NEW_EVENT_ID }));
  });

  it("저장됐는지 모른 채 다시 저장하면 앞선 시도의 판을 함께 보내, 그 판일 때만 고치게 한다", async () => {
    const scheduleTodo = createScheduleTodo();

    await scheduleWith({ scheduleTodo, draft: createDraft({ newEventId: NEW_EVENT_ID, expectedRevisions: ["r1"] }) });

    expect(scheduleTodo).toHaveBeenCalledWith(expect.objectContaining({ p_event_id: NEW_EVENT_ID, p_revision: "r2", p_expected_revisions: ["r1"] }));
  });

  it("비운 칸(시간·기간·장소·메모)은 보내지 않는다", async () => {
    const scheduleTodo = createScheduleTodo();

    await scheduleWith({ scheduleTodo });

    expect(scheduleTodo).toHaveBeenCalledWith(expect.objectContaining({ p_start_time: undefined, p_end_date: undefined, p_place: undefined, p_memo: undefined }));
  });

  it("응답이 끊기면 같은 id로 한 번 더 보내고, 다시 보내 성공하면 실패 내용이 없다", async () => {
    const scheduleTodo = createScheduleTodo([LOST_RESPONSE]);

    const failure = await scheduleWith({ scheduleTodo });

    expect(failure).toBeUndefined();
    expect(scheduleTodo).toHaveBeenCalledTimes(2);
  });

  it("그사이 하고 싶은 것이 지워졌으면(P0002) 목록에서 확인하라고 알린다", async () => {
    const failure = await scheduleWith({ scheduleTodo: createScheduleTodo([{ code: "P0002" }]) });

    expect(failure).toMatchObject({ isGone: true, message: "이 하고 싶은 것은 이미 지워졌어요. 목록에서 다시 확인해 주세요." });
  });

  it.each(["P0412", "P0409"])("그사이 다른 일정이 잡혔거나 상대가 고쳤으면(%s) 최신 내용을 불러오게 한다", async (code) => {
    const failure = await scheduleWith({ scheduleTodo: createScheduleTodo([{ code }]) });

    expect(failure).toMatchObject({ hasConflict: true, message: "그사이 일정이 바뀌어 저장 못 했어요. 불러와 확인해 주세요." });
  });

  it("두 번 다 응답이 끊기면 저장됐을 수 있다고 알린다", async () => {
    const failure = await scheduleWith({ scheduleTodo: createScheduleTodo([LOST_RESPONSE, LOST_RESPONSE]) });

    expect(failure).toMatchObject({ mayHaveSaved: true });
  });
});

describe("saveEvent 일정 폼에서 하고 싶은 것 잇기(#472·#495)", () => {
  const TODO_ID = "40000000-0000-4000-8000-000000000001";
  const OTHER_TODO_ID = "40000000-0000-4000-8000-000000000002";
  const linked = (id: string) => ({ id, content: "성수 팝업 같이 가기" });

  /** 차례로 돌려줄 오류. 다 쓰면 성공한다 */
  const createRpc = (errors: ((SaveErrorCode & { hint?: string }) | null)[] = []) => vi.fn(async () => ({ error: errors.shift() ?? null }));

  const editWith = ({ draft, expectedTodoIds, setEventTodo = createRpc(), events = createFakeRevisionedTable<EventValues>().table, occurrenceDate }: {
    draft: EventDraft;
    expectedTodoIds: string[];
    setEventTodo?: ReturnType<typeof createRpc>;
    events?: ReturnType<typeof createFakeRevisionedTable<EventValues>>["table"];
    occurrenceDate?: string;
  }) =>
    saveEvent({
      events,
      detachOccurrence: createDetachOccurrence(),
      todoLink: { expectedTodoIds, setEventTodos: setEventTodo },
      draft,
      eventId: EVENT_ID,
      occurrenceDate,
      newEventId: NEW_EVENT_ID,
      revision: "r2",
    });

  it("새 일정에서 고른 하고 싶은 것은 schedule_todos로 만들며 잇고, 그사이 다른 일정이 잡혔으면(P0412) 다시 고르라고 알린다", async () => {
    // Arrange
    const scheduleTodo = createRpc([null, { code: "P0412" }]);
    const params = {
      events: createFakeRevisionedTable<EventValues>().table,
      detachOccurrence: createDetachOccurrence(),
      todoSchedule: { todoIds: [TODO_ID], isPicked: true, scheduleTodos: scheduleTodo },
      draft: createDraft({ linkedTodos: [linked(TODO_ID)] }),
      eventId: undefined,
      occurrenceDate: undefined,
      newEventId: NEW_EVENT_ID,
      revision: "r2",
    };

    // Act
    const saved = await saveEvent(params);
    const taken = await saveEvent(params);

    // Assert
    expect(saved).toBeUndefined();
    expect(scheduleTodo).toHaveBeenCalledWith(expect.objectContaining({ p_todo_ids: [TODO_ID], p_event_id: NEW_EVENT_ID }));
    expect(taken).toMatchObject({ hasConflict: false, isGone: false, message: "고른 하고 싶은 것에 그사이 다른 일정이 이어졌어요. 다시 골라 주세요." });
  });

  it("고칠 때 하고 싶은 것을 바꿨으면 일정을 고친 뒤 고른 것과 폼을 열 때 이어져 있던 것으로 set_event_todos를 부른다", async () => {
    // Arrange
    const { table, calls } = createFakeRevisionedTable<EventValues>();
    const setEventTodo = createRpc();

    // Act
    const failure = await editWith({ draft: createDraft({ linkedTodos: [linked(OTHER_TODO_ID)], expectedRevisions: ["r1"] }), expectedTodoIds: [TODO_ID], setEventTodo, events: table });

    // Assert
    expect(failure).toBeUndefined();
    expect(calls.update).toHaveLength(1);
    expect(setEventTodo).toHaveBeenCalledWith({ p_event_id: EVENT_ID, p_todo_ids: [OTHER_TODO_ID], p_expected_todo_ids: [TODO_ID] });
  });

  it("연결을 끊으면 빈 목록으로 부르고, 바꾸지 않았으면 부르지 않는다", async () => {
    const unlink = createRpc();
    const unchanged = createRpc();

    await editWith({ draft: createDraft({ linkedTodos: undefined }), expectedTodoIds: [TODO_ID], setEventTodo: unlink });
    await editWith({ draft: createDraft({ linkedTodos: [linked(TODO_ID)] }), expectedTodoIds: [TODO_ID], setEventTodo: unchanged });

    expect(unlink).toHaveBeenCalledWith({ p_event_id: EVENT_ID, p_todo_ids: [], p_expected_todo_ids: [TODO_ID] });
    expect(unchanged).not.toHaveBeenCalled();
  });

  it("여러 개 이은 일정에 하나 더 이으면 바뀐 목록 전부를 보내고, 순서만 다르면 부르지 않는다(#495)", async () => {
    const added = createRpc();
    const reordered = createRpc();

    await editWith({ draft: createDraft({ linkedTodos: [linked(TODO_ID), linked(OTHER_TODO_ID)] }), expectedTodoIds: [TODO_ID], setEventTodo: added });
    await editWith({ draft: createDraft({ linkedTodos: [linked(OTHER_TODO_ID), linked(TODO_ID)] }), expectedTodoIds: [TODO_ID, OTHER_TODO_ID], setEventTodo: reordered });

    expect(added).toHaveBeenCalledWith({ p_event_id: EVENT_ID, p_todo_ids: [TODO_ID, OTHER_TODO_ID], p_expected_todo_ids: [TODO_ID] });
    expect(reordered).not.toHaveBeenCalled();
  });

  it("여럿 중 하나에 그사이 다른 일정이 이어졌으면(P0412) 함수가 알려 준 그 하고 싶은 것의 이름으로 알린다(#495)", async () => {
    const draft = createDraft({ linkedTodos: [linked(TODO_ID), { id: OTHER_TODO_ID, content: "요트 타기" }] });

    const failure = await editWith({ draft, expectedTodoIds: [], setEventTodo: createRpc([{ code: "P0412", hint: OTHER_TODO_ID }]) });

    expect(failure).toMatchObject({ message: "일정은 저장했지만 ‘요트 타기’에 그사이 다른 일정이 이어졌어요. 연결을 끊고 다시 저장해 주세요." });
  });

  it("일정을 고치지 못했으면 연결도 바꾸지 않는다", async () => {
    const setEventTodo = createRpc();
    const { table } = createFakeRevisionedTable<EventValues>({ updateResults: NO_UPDATED_ROWS });

    const failure = await editWith({ draft: createDraft({ linkedTodos: [linked(TODO_ID)] }), expectedTodoIds: [], setEventTodo, events: table });

    expect(failure).toMatchObject({ hasConflict: true });
    expect(setEventTodo).not.toHaveBeenCalled();
  });

  it("응답이 끊기면 한 번 더 보낸다", async () => {
    const setEventTodo = createRpc([LOST_RESPONSE]);

    const failure = await editWith({ draft: createDraft({ linkedTodos: [linked(TODO_ID)] }), expectedTodoIds: [], setEventTodo });

    expect(failure).toBeUndefined();
    expect(setEventTodo).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["P0409", { hasConflict: true, message: "일정은 저장했지만 그사이 하고 싶은 것 연결이 바뀌었어요. 불러와 확인해 주세요." }],
    ["P0412", { hasConflict: false, message: "일정은 저장했지만 고른 하고 싶은 것에 그사이 다른 일정이 이어졌어요. 다시 골라 주세요." }],
    ["P0002", { isGone: false, hasConflict: false, message: "일정은 저장했지만 고른 하고 싶은 것이 그사이 지워졌어요. 다시 골라 주세요." }],
    ["42501", { hasConflict: false, message: "일정은 저장했지만 하고 싶은 것과 잇지 못했어요. 다시 저장해 주세요." }],
  ])("연결을 바꾸지 못하면(%s) 일정은 저장됐다고 함께 알리고, 다시 저장할 수 있게 저장됐을 수 있는 판으로 둔다", async (code, expected) => {
    const failure = await editWith({ draft: createDraft({ linkedTodos: [linked(TODO_ID)] }), expectedTodoIds: [], setEventTodo: createRpc([{ code }]) });

    expect(failure).toMatchObject({ ...expected, mayHaveSaved: true, isTodoLinkUncertain: false });
  });

  it("두 번 다 응답이 끊기면 잇기가 저장됐을 수 있다고 알린다", async () => {
    const failure = await editWith({ draft: createDraft({ linkedTodos: [linked(TODO_ID)] }), expectedTodoIds: [], setEventTodo: createRpc([LOST_RESPONSE, LOST_RESPONSE]) });

    // 됐는지 모르는 잇기는 폼이 고른 것을 잠가, 다시 저장해도 같은 값만 보낸다
    expect(failure).toMatchObject({ mayHaveSaved: true, isTodoLinkUncertain: true });
  });

  it("일정을 고치지 못해 잇기를 보내지 않았으면 잇기가 됐는지 모르는지를 적지 않는다", async () => {
    const { table } = createFakeRevisionedTable<EventValues>({ updateResults: [{ data: null, error: LOST_RESPONSE }] });

    const failure = await editWith({ draft: createDraft({ linkedTodos: [linked(TODO_ID)] }), expectedTodoIds: [], events: table });

    expect(failure).toMatchObject({ mayHaveSaved: true });
    expect(failure).not.toHaveProperty("isTodoLinkUncertain");
  });

  it("새 일정을 만들며 잇기가 두 번 다 응답이 끊기면 됐는지 모른다고 적고, 다시 고르라는 실패는 모르지 않는다고 적는다", async () => {
    const create = (errors: (SaveErrorCode | null)[]) =>
      saveEvent({
        events: createFakeRevisionedTable<EventValues>().table,
        detachOccurrence: createDetachOccurrence(),
        todoSchedule: { todoIds: [TODO_ID], isPicked: true, scheduleTodos: createRpc(errors) },
        draft: createDraft({ linkedTodos: [linked(TODO_ID)] }),
        eventId: undefined,
        occurrenceDate: undefined,
        newEventId: NEW_EVENT_ID,
        revision: "r2",
      });

    expect(await create([LOST_RESPONSE, LOST_RESPONSE])).toMatchObject({ mayHaveSaved: true, isTodoLinkUncertain: true });
    expect(await create([{ code: "P0412" }])).toMatchObject({ isTodoLinkUncertain: false });
  });
});

interface FakeDeleteParams {
  deleteError?: { message: string } | null;
  upsertError?: { message: string } | null;
  isEventThere?: boolean;
  readError?: SaveErrorCode | null;
}

/** 지운 요청을 기록하는 가짜 events·event_exceptions 표 */
const createDeleteFakes = ({ deleteError = null, upsertError = null, isEventThere = false, readError = null }: FakeDeleteParams = {}) => {
  const calls = { deleted: [] as string[], upserted: [] as unknown[], read: [] as string[] };
  const events: DeletableEvents = {
    delete: () => ({
      eq: async (_column, id) => {
        calls.deleted.push(id);
        return { error: deleteError };
      },
    }),
    select: () => ({
      eq: (_column, id) => ({
        maybeSingle: async () => {
          calls.read.push(id);
          return { data: isEventThere ? { id } : null, error: readError };
        },
      }),
    }),
  };
  const exceptions: EventExceptions = {
    upsert: async (row, options) => {
      calls.upserted.push({ row, options });
      return { error: upsertError };
    },
  };
  return { events, exceptions, calls };
};

describe("deleteEvent", () => {
  it("고른 날이 없으면 일정을 지운다", async () => {
    const { events, exceptions, calls } = createDeleteFakes();

    await deleteEvent({ events, exceptions, eventId: EVENT_ID });

    expect(calls.deleted).toEqual([EVENT_ID]);
    expect(calls.upserted).toEqual([]);
  });

  it("일정을 지우지 못하면 원인을 담아 알린다", async () => {
    const { events, exceptions } = createDeleteFakes({ deleteError: { message: "권한 없음" } });

    await expect(deleteEvent({ events, exceptions, eventId: EVENT_ID })).rejects.toThrow("일정을 지우지 못했습니다: 권한 없음");
  });

  it("고른 날이 있으면 일정은 두고 그날을 건너뛸 날로 적는다(이미 적혀 있으면 그대로)", async () => {
    const { events, exceptions, calls } = createDeleteFakes();

    await deleteEvent({ events, exceptions, eventId: EVENT_ID, occurrenceDate: "2026-11-13" });

    expect(calls.deleted).toEqual([]);
    expect(calls.upserted).toEqual([{ row: { event_id: EVENT_ID, date: "2026-11-13" }, options: { ignoreDuplicates: true } }]);
  });

  it("그날을 적지 못했는데 일정이 이미 지워졌으면 지운 것으로 본다", async () => {
    const { events, exceptions, calls } = createDeleteFakes({ upsertError: { message: "외래 키" } });

    await deleteEvent({ events, exceptions, eventId: EVENT_ID, occurrenceDate: "2026-11-13" });

    expect(calls.read).toEqual([EVENT_ID]);
  });

  it("그날을 적지 못했고 일정이 남아 있으면 지우지 못했다고 알린다", async () => {
    const { events, exceptions } = createDeleteFakes({ upsertError: { message: "권한 없음" }, isEventThere: true });

    await expect(deleteEvent({ events, exceptions, eventId: EVENT_ID, occurrenceDate: "2026-11-13" })).rejects.toThrow("그날 일정을 지우지 못했습니다: 권한 없음");
  });

  it("그날을 적지 못했고 일정이 있는지도 읽지 못하면 지우지 못했다고 알린다", async () => {
    const { events, exceptions } = createDeleteFakes({ upsertError: { message: "끊김" }, readError: { code: "08006" } });

    await expect(deleteEvent({ events, exceptions, eventId: EVENT_ID, occurrenceDate: "2026-11-13" })).rejects.toThrow("그날 일정을 지우지 못했습니다");
  });
});
