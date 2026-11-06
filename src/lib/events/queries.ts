import "server-only";
import type { KstNow } from "@/lib/anniversary";
import { getGridRange } from "@/lib/calendar/month";
import { isRecordId } from "@/lib/dates/detail";
import { createClient } from "@/lib/supabase/server";
import { toCalendarRecord, type CalendarEvent, type CalendarRecord } from "./calendar";
import { toEditableEvent, type EditableEvent } from "./form";
import { expandEventRows, expandUpcomingEventRows } from "./recurrence";

/** 일정을 불러오지 못했을 때 */
export class EventLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("일정을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "EventLoadError";
  }
}

const EVENT_COLUMNS =
  "id, date, start_time, title, place, is_together, repeat_rule, repeat_until, end_date, created_at, author:members!events_author_id_fkey(nickname), exceptions:event_exceptions(date)";

/**
 * 달력에 그릴 한 달(앞뒤 주 포함)의 일정과 데이트 기록을 함께 읽는다. 기록은 기간이 이 범위와 겹치면 읽는다.
 * 반복 일정은 범위 안의 날마다 펼치고, 일정은 날짜 → 종일 먼저 → 시간 → 만든 순서로 정렬한다.
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
      .select(EVENT_COLUMNS)
      .lte("date", end)
      // 하루 일정은 범위 안의 날만, 반복·기간 일정은 범위 앞에 시작했어도 끝나지 않았으면 읽는다. 반복이 아니면 끝나는 날은 늘 비어 있다
      .or(`date.gte.${start},repeat_rule.not.is.null,end_date.gte.${start}`)
      .or(`repeat_until.is.null,repeat_until.gte.${start}`),
    supabase
      .from("dates")
      .select("id, date, end_date, title, author:members!dates_author_id_fkey(nickname)")
      .lte("date", end)
      // coalesce(end_date, date) >= start와 같다. 끝 날짜는 있으면 늘 시작일보다 뒤다(dates_end_date_after_date)
      .or(`date.gte.${start},end_date.gte.${start}`)
      .order("date")
      .order("created_at"),
  ]);
  if (eventsResult.error) throw new EventLoadError({ cause: eventsResult.error });
  if (recordsResult.error) throw new EventLoadError({ cause: recordsResult.error });

  return { events: expandEventRows(eventsResult.data, { start, end }), records: recordsResult.data.map(toCalendarRecord) };
};

/** 홈 일정 칸에 읽을 한 번짜리 일정 수. 칸에는 2개와 그날 못 넣은 수만 쓰므로 이만큼이면 넉넉하다 */
const UPCOMING_EVENTS_LIMIT = 50;

/**
 * 앞으로의 일정을 하나당 가장 가까운 날 한 줄씩 날짜 → 종일 먼저 → 시간 → 만든 순서로 읽는다(홈).
 * 칸에 넣을 만큼 고르는 일은 `previewUpcomingEvents`가 한다.
 *
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const events = await getUpcomingEvents(toKstNow(new Date()))
 */
export const getUpcomingEvents = async (now: KstNow): Promise<CalendarEvent[]> => {
  const today = now.date;
  const supabase = await createClient();
  const [singleResult, repeatingResult] = await Promise.all([
    supabase
      .from("events")
      .select(EVENT_COLUMNS)
      .is("repeat_rule", null)
      // 이미 시작한 기간 일정도 끝나기 전까지 읽는다
      .or(`date.gte.${today},end_date.gte.${today}`)
      .order("date")
      .order("start_time", { nullsFirst: true })
      .order("created_at")
      .limit(UPCOMING_EVENTS_LIMIT),
    supabase.from("events").select(EVENT_COLUMNS).not("repeat_rule", "is", null).or(`repeat_until.is.null,repeat_until.gte.${today}`),
  ]);
  if (singleResult.error) throw new EventLoadError({ cause: singleResult.error });
  if (repeatingResult.error) throw new EventLoadError({ cause: repeatingResult.error });

  return expandUpcomingEventRows([...singleResult.data, ...repeatingResult.data], now);
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
    .select(
      "id, date, start_time, title, place, memo, is_together, repeat_rule, repeat_until, end_date, repeat_parent_id, author:members!events_author_id_fkey(nickname), exceptions:event_exceptions(date)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new EventLoadError({ cause: error });
  return data ? toEditableEvent(data) : undefined;
};
