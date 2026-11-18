import type { SupabaseClient } from "@supabase/supabase-js";
import { getGridRange } from "@/lib/calendar/month";
import type { Database } from "@/lib/supabase/database.types";
import { toCalendarRecord, type CalendarEvent, type CalendarRecord } from "./calendar";
import { EventLoadError } from "./load-error";
import { expandEventRows, type DateRange } from "./recurrence";

export const EVENT_COLUMNS =
  "id, date, start_time, title, place, is_together, repeat_rule, repeat_until, end_date, created_at, author:members!events_author_id_fkey(nickname), exceptions:event_exceptions(date)";

/** 캘린더는 일정 줄에 "기록 보기"를 달려고 일정에서 남긴 기록도 읽는다(#227). 기록 날짜가 달 밖이어도 빠지지 않는다 */
// 저장 중인 일정을 먼저 그린 뒤 서버 값이 따라잡았는지 판 번호로 안다(#345)
const CALENDAR_EVENT_COLUMNS = `${EVENT_COLUMNS}, revision, records:dates(id, event_date)` as const;

/** 달력 한 달(앞뒤 주 포함)에 그릴 일정과 데이트 기록 */
export interface CalendarMonth {
  events: CalendarEvent[];
  records: CalendarRecord[];
}

/**
 * 범위와 겹치는 일정을 이어진 기록과 함께 읽는다. 하루 일정은 범위 안의 날만, 반복·기간 일정은 범위 앞에 시작했어도 끝나지 않았으면 읽는다.
 *
 * @example const { data, error } = await selectCalendarEvents(supabase, { start: "2026-11-01", end: "2026-11-30" })
 */
export const selectCalendarEvents = (supabase: SupabaseClient<Database>, { start, end }: DateRange) =>
  supabase
    .from("events")
    .select(CALENDAR_EVENT_COLUMNS)
    .lte("date", end)
    // 반복이 아니면 끝나는 날은 늘 비어 있다
    .or(`date.gte.${start},repeat_rule.not.is.null,end_date.gte.${start}`)
    .or(`repeat_until.is.null,repeat_until.gte.${start}`);

/**
 * 달력에 그릴 한 달(앞뒤 주 포함)의 일정과 데이트 기록을 함께 읽는다. 기록은 기간이 이 범위와 겹치면 읽는다.
 * 반복 일정은 범위 안의 날마다 펼치고, 일정은 날짜 → 종일 먼저 → 시간 → 만든 순서로 정렬한다.
 * 서버(처음 연 달)와 브라우저(넘긴 달, #348)가 같은 조회를 쓴다.
 *
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const { events, records } = await readCalendarMonth(supabase, "2026-11")
 */
export const readCalendarMonth = async (supabase: SupabaseClient<Database>, month: string): Promise<CalendarMonth> => {
  const { start, end } = getGridRange(month);
  const [eventsResult, recordsResult] = await Promise.all([
    selectCalendarEvents(supabase, { start, end }),
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
