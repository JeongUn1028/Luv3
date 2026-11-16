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
