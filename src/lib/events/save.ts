import { callWithRetry, createRowWithRetry, toRejectedOutcome, toSaveFailure, updateRowWithRetry, type SaveFailure, type SaveOutcome } from "@/lib/save-outcome";
import { createClient } from "@/lib/supabase/client";
import { toEventValues, type EventDraft } from "./form";

const MESSAGES = {
  failedMessage: "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  goneMessage: "이 일정은 이미 지워졌어요. 캘린더에서 다시 확인해 주세요.",
  // 일정 폼은 높이 여유가 없어 한 줄로 둔다(#57). 저장 버튼 자리의 "최신 내용 불러오기"가 할 일을 알려 준다
  conflictMessage: "그사이 바뀌어 저장 못 했어요. 불러오면 쓴 내용은 사라져요.",
};
const OCCURRENCE_GONE_MESSAGE = "이 날 일정은 이미 고쳤거나 지웠어요. 캘린더에서 다시 확인해 주세요.";

// PostgREST가 함수의 no_data_found를 전달한 코드(마이그레이션 detach_event_occurrence)
const NO_DATA_FOUND = "P0002";

/** 화면을 연 뒤 반복 일정이 바뀌어 `detach_event_occurrence`가 거부했을 때(마이그레이션 event_todo_revision) */
const CONFLICT_CODE = "P0409";

interface SaveEventParams {
  draft: EventDraft;
  /** 고칠 일정의 id. 없으면 새 일정을 만든다 */
  eventId: string | undefined;
  /** 반복 중 고를 수 있는 날. 범위가 `occurrence`일 때 이 날만 고친다 */
  occurrenceDate: string | undefined;
  /** 새 일정(이 날만 고치면 따로 나올 일정)에 쓸 id. 다시 저장할 때 앞선 시도와 같은 값을 넘겨 일정이 둘이 되지 않게 한다 */
  newEventId: string;
  /** 이번 저장으로 바뀔 판 번호. 시도마다 새로 만든다 */
  revision: string;
}

const saveOccurrence = async ({ draft, eventId, occurrenceDate, newEventId }: SaveEventParams & { eventId: string; occurrenceDate: string }): Promise<SaveOutcome> => {
  const { date, start_time, title, place, memo } = toEventValues(draft);
  // 같은 id로 다시 보내면 함수가 앞서 만든 일정을 돌려주므로 응답만 끊겼을 때 다시 보내도 된다
  const { error, mayHaveApplied } = await callWithRetry(() =>
    createClient().rpc("detach_event_occurrence", {
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
  if (error.code === CONFLICT_CODE) return "conflict";
  if (error.code === NO_DATA_FOUND) return "gone";
  return toRejectedOutcome(error, mayHaveApplied);
};

const saveRow = async ({ draft, eventId, newEventId, revision }: SaveEventParams): Promise<SaveOutcome> => {
  const events = createClient().from("events");
  const values = { ...toEventValues(draft), revision };
  // 불러온 판과 내 앞선 시도의 판만 허용한다. 내 이번 판도 허용해야 응답만 끊긴 요청을 그대로 다시 보낼 수 있다
  const allowedRevisions = [...(draft.expectedRevisions ?? []), revision];
  const update = (id: string) => () => events.update(values).eq("id", id).in("revision", allowedRevisions).select("id");
  const readRow = (id: string) => () => events.select("id").eq("id", id).maybeSingle();
  if (eventId) return updateRowWithRetry({ update: update(eventId), readRow: readRow(eventId) });
  return createRowWithRetry({ insert: () => events.insert({ ...values, id: newEventId }), update: update(newEventId), readRow: readRow(newEventId) });
};

/**
 * 일정을 저장한다. 새 일정을 만들거나, 일정 전체를 고치거나, 반복 중 하루만 고친다.
 * 응답만 끊기면 한 번 더 보낸다. 새 일정은 `newEventId`로 만들어 다시 보내도 하나만 생긴다.
 * 화면을 연 뒤 상대가 고쳤으면(판 번호가 `draft.expectedRevisions`에 없으면) 저장하지 않고 `hasConflict`로 알린다.
 *
 * @returns 실패하면 화면에 보여 줄 내용, 성공하면 undefined
 * @example const failure = await saveEvent({ draft, eventId, occurrenceDate, newEventId: draft.newEventId ?? crypto.randomUUID(), revision: crypto.randomUUID() })
 */
export const saveEvent = async (params: SaveEventParams): Promise<SaveFailure | undefined> => {
  const { draft, eventId, occurrenceDate } = params;
  if (eventId && occurrenceDate && draft.scope === "occurrence") {
    const outcome = await saveOccurrence({ ...params, eventId, occurrenceDate });
    return toSaveFailure(outcome, { ...MESSAGES, goneMessage: OCCURRENCE_GONE_MESSAGE });
  }
  return toSaveFailure(await saveRow(params), MESSAGES);
};

/**
 * 일정을 지운다. `occurrenceDate`를 주면 반복 중 그날만 건너뛰고, 없으면 일정을 지운다(반복이면 따로 고친 날까지 함께).
 * 이미 지워졌으면 지운 것으로 본다.
 *
 * @throws {Error} 지우지 못했을 때
 * @example await deleteEvent({ eventId, occurrenceDate: "2026-11-13" })
 */
export const deleteEvent = async ({ eventId, occurrenceDate }: { eventId: string; occurrenceDate?: string }): Promise<void> => {
  const supabase = createClient();
  if (!occurrenceDate) {
    const { error } = await supabase.from("events").delete().eq("id", eventId);
    if (error) throw new Error(`일정을 지우지 못했습니다: ${error.message}`, { cause: error });
    return;
  }
  const { error } = await supabase
    .from("event_exceptions")
    .upsert({ event_id: eventId, date: occurrenceDate }, { ignoreDuplicates: true });
  if (!error) return;

  // 반복 일정이 지워졌어도 정책이나 외래 키에 걸린다. 권한 실패와 구분하려고 일정이 정말 없는지 다시 읽는다
  const { data, error: readError } = await supabase.from("events").select("id").eq("id", eventId).maybeSingle();
  if (!readError && !data) return;
  throw new Error(`그날 일정을 지우지 못했습니다: ${error.message}`, { cause: error });
};
