import { saveRowAtRevision, type RevisionedTable } from "@/lib/revision";
import { callWithRetry, toNotSentFailure, toRejectedOutcome, toSaveFailure, type SaveErrorCode, type SaveFailure, type SaveOutcome } from "@/lib/save-outcome";
import type { Database } from "@/lib/supabase/database.types";
import { DB_ERROR_CODE } from "@/lib/supabase/error-codes";
import { toEventValues, type EventDraft, type EventValues } from "./form";

const MESSAGES = {
  failedMessage: "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  goneMessage: "이 일정은 이미 지워졌어요. 캘린더에서 다시 확인해 주세요.",
  // 일정 폼은 높이 여유가 없어 한 줄로 둔다(#57). 저장 버튼 자리의 "최신 내용 불러오기"가 할 일을 알려 준다
  conflictMessage: "그사이 바뀌어 저장 못 했어요. 불러오면 쓴 내용은 사라져요.",
};
/** 저장 요청을 보내지 못했을 때(라이브러리 파일을 받지 못함 등) 폼이 보여 줄 실패 */
export const EVENT_NOT_SENT_FAILURE: SaveFailure = toNotSentFailure(MESSAGES.failedMessage);

const OCCURRENCE_GONE_MESSAGE = "이 날 일정은 이미 고쳤거나 지웠어요. 캘린더에서 다시 확인해 주세요.";

const TODO_SCHEDULE_MESSAGES = {
  failedMessage: MESSAGES.failedMessage,
  goneMessage: "이 하고 싶은 것은 이미 지워졌어요. 목록에서 다시 확인해 주세요.",
  conflictMessage: "그사이 일정이 바뀌어 저장 못 했어요. 불러와 확인해 주세요.",
};

/** `detach_event_occurrence` 함수에 넘기는 값 */
type DetachOccurrenceArgs = Database["public"]["Functions"]["detach_event_occurrence"]["Args"];

/** `schedule_todo` 함수에 넘기는 값 */
type ScheduleTodoArgs = Database["public"]["Functions"]["schedule_todo"]["Args"];

/** 새 일정을 하고 싶은 것에 이어 만들 때(#471) */
interface TodoSchedule {
  todoId: string;
  /** `(args) => supabase.rpc("schedule_todo", args)` */
  scheduleTodo: (args: ScheduleTodoArgs) => PromiseLike<{ error: SaveErrorCode | null }>;
}

interface SaveEventParams {
  /** `supabase.from("events")` */
  events: RevisionedTable<EventValues>;
  /** `(args) => supabase.rpc("detach_event_occurrence", args)` */
  detachOccurrence: (args: DetachOccurrenceArgs) => PromiseLike<{ error: SaveErrorCode | null }>;
  draft: EventDraft;
  /** 고칠 일정의 id. 없으면 새 일정을 만든다 */
  eventId: string | undefined;
  /** 반복 중 고를 수 있는 날. 범위가 `occurrence`일 때 이 날만 고친다 */
  occurrenceDate: string | undefined;
  /** 새 일정(이 날만 고치면 따로 나올 일정)에 쓸 id. 다시 저장할 때 앞선 시도와 같은 값을 넘겨 일정이 둘이 되지 않게 한다 */
  newEventId: string;
  /** 이번 저장으로 바뀔 판 번호. 시도마다 새로 만든다 */
  revision: string;
  /** 새 일정을 하고 싶은 것에 이어 만든다. 고칠 때는 쓰지 않는다 */
  todoSchedule?: TodoSchedule | undefined;
}

const saveOccurrence = async ({
  detachOccurrence,
  draft,
  eventId,
  occurrenceDate,
  newEventId,
}: SaveEventParams & { eventId: string; occurrenceDate: string }): Promise<SaveOutcome> => {
  const { date, start_time, title, place, memo } = toEventValues(draft);
  // 같은 id로 다시 보내면 함수가 앞서 만든 일정을 돌려주므로 응답만 끊겼을 때 다시 보내도 된다
  const { error, mayHaveApplied } = await callWithRetry(() =>
    detachOccurrence({
      p_event_id: eventId,
      p_occurrence_date: occurrenceDate,
      p_date: date,
      p_title: title,
      p_start_time: start_time ?? undefined,
      p_place: place ?? undefined,
      p_memo: memo ?? undefined,
      p_expected_revisions: draft.expectedRevisions,
      p_new_event_id: newEventId,
    }),
  );
  if (!error) return "saved";
  if (error.code === DB_ERROR_CODE.conflict) return "conflict";
  if (error.code === DB_ERROR_CODE.notFound) return "gone";
  return toRejectedOutcome(error, mayHaveApplied);
};

const saveTodoSchedule = async ({ draft, newEventId, revision }: SaveEventParams, { todoId, scheduleTodo }: TodoSchedule): Promise<SaveOutcome> => {
  // 폼이 반복 칸을 숨겨 반복은 보내지 않는다(반복 일정은 하고 싶은 것과 잇지 않는다)
  const { date, start_time, end_date, title, place, memo, is_together } = toEventValues({ ...draft, repeatRule: undefined });
  // 같은 일정 id로 다시 보내면 함수가 이미 이어진 일정을 이번 값으로 고치므로 응답만 끊겼을 때 다시 보내도 된다
  const { error, mayHaveApplied } = await callWithRetry(() =>
    scheduleTodo({
      p_todo_id: todoId,
      p_event_id: newEventId,
      p_revision: revision,
      p_date: date,
      p_title: title,
      p_is_together: is_together,
      p_start_time: start_time ?? undefined,
      p_end_date: end_date ?? undefined,
      p_place: place ?? undefined,
      p_memo: memo ?? undefined,
      // 저장됐을 수 있는 앞선 시도의 판. 그사이 상대가 그 일정을 고쳤으면 함수가 덮어쓰지 않고 거부한다
      p_expected_revisions: draft.expectedRevisions ?? [],
    }),
  );
  if (!error) return "saved";
  // 그사이 다른 일정이 잡혔거나, 저장됐던 내 일정을 상대가 고쳤다. 어느 쪽이든 불러오면 이미 잡힌 일정이 보인다
  if (error.code === DB_ERROR_CODE.todoScheduled || error.code === DB_ERROR_CODE.conflict) return "conflict";
  if (error.code === DB_ERROR_CODE.notFound) return "gone";
  return toRejectedOutcome(error, mayHaveApplied);
};

const saveRow = ({ events, draft, eventId, newEventId, revision }: SaveEventParams): Promise<SaveOutcome> =>
  saveRowAtRevision({
    table: events,
    rowId: eventId,
    newRowId: newEventId,
    values: toEventValues(draft),
    expectedRevisions: draft.expectedRevisions,
    revision,
  });

/**
 * 일정을 저장한다. 새 일정을 만들거나(하고 싶은 것에 이어 만들 수도 있다), 일정 전체를 고치거나, 반복 중 하루만 고친다.
 * 응답만 끊기면 한 번 더 보낸다. 새 일정은 `newEventId`로 만들어 다시 보내도 하나만 생긴다.
 * 화면을 연 뒤 상대가 고쳤으면(판 번호가 `draft.expectedRevisions`에 없으면) 저장하지 않고 `hasConflict`로 알린다.
 *
 * @returns 실패하면 화면에 보여 줄 내용, 성공하면 undefined
 * @example
 * const failure = await saveEvent({
 *   events: supabase.from("events"), detachOccurrence: (args) => supabase.rpc("detach_event_occurrence", args),
 *   draft, eventId, occurrenceDate, newEventId: draft.newEventId ?? crypto.randomUUID(), revision: crypto.randomUUID(),
 * })
 */
export const saveEvent = async (params: SaveEventParams): Promise<SaveFailure | undefined> => {
  const { draft, eventId, occurrenceDate, todoSchedule } = params;
  if (!eventId && todoSchedule) return toSaveFailure(await saveTodoSchedule(params, todoSchedule), TODO_SCHEDULE_MESSAGES);
  if (eventId && occurrenceDate && draft.scope === "occurrence") {
    const outcome = await saveOccurrence({ ...params, eventId, occurrenceDate });
    return toSaveFailure(outcome, { ...MESSAGES, goneMessage: OCCURRENCE_GONE_MESSAGE });
  }
  return toSaveFailure(await saveRow(params), MESSAGES);
};

/** 지우지 못한 이유. 오류 문구에 넣는다 */
interface DeleteError {
  message: string;
}

/**
 * 일정을 지우고, 지웠는지 다시 읽을 수 있는 표. Supabase의 `createClient().from("events")`가 이 모양이다. 테스트는 같은 모양의 가짜를 넘긴다.
 *
 * @example const events: DeletableEvents = supabase.from("events");
 */
export interface DeletableEvents {
  delete: () => { eq: (column: "id", value: string) => PromiseLike<{ error: DeleteError | null }> };
  select: (columns: "id") => {
    eq: (column: "id", value: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: SaveErrorCode | null }> };
  };
}

/**
 * 반복 중 건너뛸 날을 적는 표. Supabase의 `createClient().from("event_exceptions")`가 이 모양이다.
 *
 * @example const exceptions: EventExceptions = supabase.from("event_exceptions");
 */
export interface EventExceptions {
  upsert: (row: { event_id: string; date: string }, options: { ignoreDuplicates: true }) => PromiseLike<{ error: DeleteError | null }>;
}

interface DeleteEventParams {
  /** `supabase.from("events")` */
  events: DeletableEvents;
  /** `supabase.from("event_exceptions")` */
  exceptions: EventExceptions;
  eventId: string;
  /** 반복 중 그날만 건너뛸 날. 없으면 일정을 지운다 */
  occurrenceDate?: string;
}

/**
 * 일정을 지운다. `occurrenceDate`를 주면 반복 중 그날만 건너뛰고, 없으면 일정을 지운다(반복이면 따로 고친 날까지 함께).
 * 이미 지워졌으면 지운 것으로 본다.
 *
 * @throws {Error} 지우지 못했을 때
 * @example await deleteEvent({ events: supabase.from("events"), exceptions: supabase.from("event_exceptions"), eventId, occurrenceDate: "2026-11-13" })
 */
export const deleteEvent = async ({ events, exceptions, eventId, occurrenceDate }: DeleteEventParams): Promise<void> => {
  if (!occurrenceDate) {
    const { error } = await events.delete().eq("id", eventId);
    if (error) throw new Error(`일정을 지우지 못했습니다: ${error.message}`, { cause: error });
    return;
  }
  const { error } = await exceptions.upsert({ event_id: eventId, date: occurrenceDate }, { ignoreDuplicates: true });
  if (!error) return;

  // 반복 일정이 지워졌어도 정책이나 외래 키에 걸린다. 권한 실패와 구분하려고 일정이 정말 없는지 다시 읽는다
  const { data, error: readError } = await events.select("id").eq("id", eventId).maybeSingle();
  if (!readError && !data) return;
  throw new Error(`그날 일정을 지우지 못했습니다: ${error.message}`, { cause: error });
};
