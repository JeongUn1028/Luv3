import { createRowWithRetry, toSaveFailure, updateRowWithRetry, type SaveFailure } from "@/lib/save-outcome";
import { createClient } from "@/lib/supabase/client";
import { toEventValues, type EventDraft } from "./form";

const SAVE_FAILED_MESSAGE = "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
const GONE_MESSAGE = "이 일정은 이미 지워졌어요. 캘린더에서 다시 확인해 주세요.";
const OCCURRENCE_GONE_MESSAGE = "이 날 일정은 이미 고쳤거나 지웠어요. 캘린더에서 다시 확인해 주세요.";

// PostgREST가 함수의 no_data_found를 전달한 코드(마이그레이션 detach_event_occurrence)
const NO_DATA_FOUND = "P0002";

interface SaveEventParams {
  draft: EventDraft;
  /** 고칠 일정의 id. 없으면 새 일정을 만든다 */
  eventId: string | undefined;
  /** 반복 중 고를 수 있는 날. 범위가 `occurrence`일 때 이 날만 고친다 */
  occurrenceDate: string | undefined;
  /** 새 일정에 쓸 id. 다시 저장할 때 앞선 시도와 같은 값을 넘겨 일정이 둘이 되지 않게 한다 */
  newEventId: string;
}

const MESSAGES = { failedMessage: SAVE_FAILED_MESSAGE, goneMessage: GONE_MESSAGE };

const saveOccurrence = async (draft: EventDraft, eventId: string, occurrenceDate: string): Promise<SaveFailure | undefined> => {
  const { date, start_time, title, place, memo } = toEventValues(draft);
  const { error } = await createClient().rpc("detach_event_occurrence", {
    p_event_id: eventId,
    p_occurrence_date: occurrenceDate,
    p_date: date,
    p_title: title,
    p_start_time: start_time ?? undefined,
    p_place: place ?? undefined,
    p_memo: memo ?? undefined,
  });
  if (!error) return undefined;
  // 이 날만 고치기의 재시도는 DB 함수가 같은 일정을 알아봐야 해서 다음 작업(#161 판 번호)에서 다룬다
  return toSaveFailure(error.code === NO_DATA_FOUND ? "gone" : "failed", { ...MESSAGES, goneMessage: OCCURRENCE_GONE_MESSAGE });
};

/**
 * 일정을 저장한다. 새 일정을 만들거나, 일정 전체를 고치거나, 반복 중 하루만 고친다.
 * 응답만 끊기면 한 번 더 보낸다. 새 일정은 `newEventId`로 만들어 다시 보내도 하나만 생긴다.
 *
 * @returns 실패하면 화면에 보여 줄 내용, 성공하면 undefined
 * @example const failure = await saveEvent({ draft, eventId, occurrenceDate, newEventId: draft.newEventId ?? crypto.randomUUID() })
 */
export const saveEvent = async ({ draft, eventId, occurrenceDate, newEventId }: SaveEventParams): Promise<SaveFailure | undefined> => {
  if (eventId && occurrenceDate && draft.scope === "occurrence") return saveOccurrence(draft, eventId, occurrenceDate);

  const events = createClient().from("events");
  const values = toEventValues(draft);
  const update = (id: string) => () => events.update(values).eq("id", id).select("id");
  const outcome = eventId
    ? await updateRowWithRetry(update(eventId))
    : await createRowWithRetry({ insert: () => events.insert({ ...values, id: newEventId }), update: update(newEventId) });
  return toSaveFailure(outcome, MESSAGES);
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
