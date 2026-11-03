import "server-only";
import { getGridRange } from "@/lib/calendar/month";
import { isRecordId } from "@/lib/dates/detail";
import { createClient } from "@/lib/supabase/server";
import { toCalendarEvent, toCalendarRecord, type CalendarEvent, type CalendarRecord } from "./calendar";
import { toEditableEvent, type EditableEvent } from "./form";

/** 일정을 불러오지 못했을 때 */
export class EventLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "EventLoadError";
  }
}

/**
 * 달력에 그릴 한 달(앞뒤 주 포함)의 일정과 데이트 기록을 함께 읽는다.
 * 일정은 날짜 → 종일 먼저 → 시간 → 만든 순서로 정렬한다.
 *
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const { events, records } = await getCalendarMonth("2026-11")
 */
export const getCalendarMonth = async (
  month: string,
): Promise<{ events: CalendarEvent[]; records: CalendarRecord[] }> => {
  const { start, end } = getGridRange(month);
  const supabase = await createClient();
  const [eventsResult, recordsResult] = await Promise.all([
    supabase
      .from("events")
      .select("id, date, start_time, title, place, author:members!events_author_id_fkey(nickname)")
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("start_time", { nullsFirst: true })
      .order("created_at"),
    supabase
      .from("dates")
      .select("id, date, title, author:members!dates_author_id_fkey(nickname)")
      .gte("date", start)
      .lte("date", end)
      .order("date")
      .order("created_at"),
  ]);
  if (eventsResult.error) throw new EventLoadError({ cause: eventsResult.error });
  if (recordsResult.error) throw new EventLoadError({ cause: recordsResult.error });

  return { events: eventsResult.data.map(toCalendarEvent), records: recordsResult.data.map(toCalendarRecord) };
};

/**
 * 일정 하나와 작성자 닉네임을 읽는다(수정 화면).
 *
 * @returns 없는 일정이거나 id 형식이 틀리면 undefined
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const event = await getEvent(id); if (!event) notFound()
 */
export const getEvent = async (id: string): Promise<EditableEvent | undefined> => {
  if (!isRecordId(id)) return undefined;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, date, start_time, title, place, memo, author:members!events_author_id_fkey(nickname)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new EventLoadError({ cause: error });
  return data ? toEditableEvent(data) : undefined;
};
