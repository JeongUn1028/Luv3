import "server-only";
import type { KstNow } from "@/lib/anniversary";
import { isUuid } from "@/lib/guards";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { createClient } from "@/lib/supabase/server";
import type { CalendarEvent } from "./calendar";
import { EVENT_COLUMNS, readCalendarMonth, selectCalendarEvents, type CalendarMonth } from "./calendar-month";
import type { RecordPrefill } from "@/lib/dates/form";
import { isIsoDate } from "@/lib/form";
import { toEditableEvent, type EditableEvent } from "./form";
import { listLinkableEvents, toEventRecordPrefill, type LinkableEvent } from "./record-link";
import { EventLoadError } from "./load-error";
import { expandEventRows, expandUpcomingEventRows, type DateRange } from "./recurrence";

export { EventLoadError } from "./load-error";

/**
 * 달력에 그릴 한 달(앞뒤 주 포함)의 일정과 데이트 기록을 서버에서 읽는다(`readCalendarMonth`).
 *
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const { events, records } = await getCalendarMonth("2026-11")
 */
export const getCalendarMonth = async (month: string): Promise<CalendarMonth> => readCalendarMonth(await createClient(), month);

/**
 * 앞으로의 일정을 하나당 가장 가까운 날 한 줄씩 날짜 → 종일 먼저 → 시간 → 만든 순서로 읽는다(홈).
 * 칸에 넣을 만큼 고르는 일은 `previewUpcomingEvents`가 한다. 그날 못 넣은 수("외 N개")가 맞도록 앞으로의 일정을 끝까지 나눠 읽는다(#272).
 *
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const events = await getUpcomingEvents(toKstNow(new Date()))
 */
export const getUpcomingEvents = async (now: KstNow): Promise<CalendarEvent[]> => {
  const today = now.date;
  const supabase = await createClient();
  const [singleRows, repeatingRows] = await Promise.all([
    readAllRows({
      fetchPage: (afterId, limit) => {
        const query = supabase
          .from("events")
          .select(EVENT_COLUMNS)
          .is("repeat_rule", null)
          // 이미 시작한 기간 일정도 끝나기 전까지 읽는다
          .or(`date.gte.${today},end_date.gte.${today}`);
        return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
      },
      toError: (cause) => new EventLoadError({ cause }),
    }),
    readAllRows({
      fetchPage: (afterId, limit) => {
        const query = supabase
          .from("events")
          .select(EVENT_COLUMNS)
          .not("repeat_rule", "is", null)
          .or(`repeat_until.is.null,repeat_until.gte.${today}`);
        return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
      },
      toError: (cause) => new EventLoadError({ cause }),
    }),
  ]);

  // 날짜 → 종일 먼저 → 시간 → 만든 순서 정렬은 펼친 뒤에 한다
  return expandUpcomingEventRows([...singleRows, ...repeatingRows], now);
};

/**
 * 일정 하나와 작성자 닉네임을 읽는다(수정 화면).
 *
 * @returns 없는 일정이거나 id 형식이 틀리면 undefined
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const event = await getEvent(id); if (!event) notFound()
 */
export const getEvent = async (id: string): Promise<EditableEvent | undefined> => {
  if (!isUuid(id)) return undefined;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, date, start_time, title, place, memo, is_together, repeat_rule, repeat_until, end_date, repeat_parent_id, revision, author:members!events_author_id_fkey(nickname), exceptions:event_exceptions(date), records:dates(id, event_date)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw new EventLoadError({ cause: error });
  return data ? toEditableEvent(data) : undefined;
};

/**
 * 일정의 그날로 남길 기록의 처음 값을 일정에서 읽는다(기록 작성 화면, #227).
 *
 * @returns 없는 일정이거나 그날로 남길 수 없으면 undefined(연결 없이 쓴다)
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const prefill = await getEventRecordPrefill({ eventId, eventDate }, today)
 */
export const getEventRecordPrefill = async (
  { eventId, eventDate }: { eventId: string; eventDate: string },
  today: string,
): Promise<RecordPrefill | undefined> => {
  if (!isUuid(eventId) || !isIsoDate(eventDate)) return undefined;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("events")
    .select("id, date, title, memo, is_together, repeat_rule, repeat_until, end_date, exceptions:event_exceptions(date)")
    .eq("id", eventId)
    .maybeSingle();
  if (error) throw new EventLoadError({ cause: error });
  return data ? toEventRecordPrefill(data, eventDate, today) : undefined;
};

/**
 * 기록 기간에 있는 일정 중 그 기록을 이을 수 있는 일정의 그날을 읽는다(기록 상세의 "일정과 잇기", #237).
 * 조건은 캘린더의 "기록 남기기"와 같다: 오늘까지 끝난 함께 일정이고, 그날 이어진 기록이 없다.
 *
 * @throws {EventLoadError} 조회가 실패했을 때
 * @example const events = await getLinkableEvents({ start: record.date, end: record.endDate ?? record.date }, today)
 */
export const getLinkableEvents = async (range: DateRange, today: string): Promise<LinkableEvent[]> => {
  const { data, error } = await selectCalendarEvents(await createClient(), range);
  if (error) throw new EventLoadError({ cause: error });
  return listLinkableEvents(expandEventRows(data, range), today);
};
