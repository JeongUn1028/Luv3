import { createClient } from "@/lib/supabase/client";
import { toEventValues, type EventDraft } from "./form";

const SAVE_FAILED_MESSAGE = "일정을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
const GONE_MESSAGE = "이 일정은 이미 지워졌어요. 캘린더에서 다시 확인해 주세요.";
const OCCURRENCE_GONE_MESSAGE = "이 날 일정은 이미 고쳤거나 지웠어요. 캘린더에서 다시 확인해 주세요.";

// PostgREST가 함수의 no_data_found를 전달한 코드(마이그레이션 detach_event_occurrence)
const NO_DATA_FOUND = "P0002";

/** 저장 실패. 화면에 보여 줄 문구와, 고칠 대상이 이미 없는지 */
export interface SaveEventFailure {
  message: string;
  isGone: boolean;
}

interface SaveEventParams {
  draft: EventDraft;
  /** 고칠 일정의 id. 없으면 새 일정을 만든다 */
  eventId: string | undefined;
  /** 반복 중 고를 수 있는 날. 범위가 `occurrence`일 때 이 날만 고친다 */
  occurrenceDate: string | undefined;
}

const failSave = (message: string, isGone = false): SaveEventFailure => ({ message, isGone });

const saveOccurrence = async (draft: EventDraft, eventId: string, occurrenceDate: string): Promise<SaveEventFailure | undefined> => {
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
  return error.code === NO_DATA_FOUND ? failSave(OCCURRENCE_GONE_MESSAGE, true) : failSave(SAVE_FAILED_MESSAGE);
};

/**
 * 일정을 저장한다. 새 일정을 만들거나, 일정 전체를 고치거나, 반복 중 하루만 고친다.
 *
 * @returns 실패하면 화면에 보여 줄 내용, 성공하면 undefined
 * @example const failure = await saveEvent({ draft, eventId, occurrenceDate })
 */
export const saveEvent = async ({ draft, eventId, occurrenceDate }: SaveEventParams): Promise<SaveEventFailure | undefined> => {
  if (eventId && occurrenceDate && draft.scope === "occurrence") return saveOccurrence(draft, eventId, occurrenceDate);

  const events = createClient().from("events");
  const values = toEventValues(draft);
  if (!eventId) {
    const { error } = await events.insert(values);
    return error ? failSave(SAVE_FAILED_MESSAGE) : undefined;
  }
  // 고치는 사이 상대가 지운 일정은 오류 없이 0행이 바뀌므로, 바뀐 행을 받아 확인한다
  const { data, error } = await events.update(values).eq("id", eventId).select("id");
  if (error) return failSave(SAVE_FAILED_MESSAGE);
  return data.length === 0 ? failSave(GONE_MESSAGE, true) : undefined;
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
