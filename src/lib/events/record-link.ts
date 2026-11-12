import { TITLE_MAX_LENGTH, takeChars, type RecordPrefill } from "@/lib/dates/form";
import { findLinkedRecordId, isRepeatRule, type CalendarEvent, type CalendarEventRow } from "./calendar";
import { findOccurrenceDate } from "./recurrence";

/**
 * 일정 줄·일정 고치기의 기록 버튼: 이어진 기록 보기, 또는 그날로 기록 남기기.
 * 남길 때 `eventDate`부터 `lastDate`(기간 일정의 끝 날짜, 아니면 같은 날)까지가 이미 쓴 기록을 찾을 범위다(#237).
 */
export type EventRecordLink = { kind: "view"; recordId: string } | { kind: "leave"; eventDate: string; lastDate: string };

/**
 * 일정의 기록 버튼을 정한다(#227). 이어진 기록이 있으면 늘 보여 준다.
 * 없으면 오늘까지의 함께 일정에만 남기기를 권한다. 데이트 기록은 둘이 함께 한 일을 남기는 곳이고(#61),
 * 기록의 끝 날짜는 오늘까지만 고를 수 있어서 기간 일정은 끝나는 날부터 권한다.
 * 연결 날짜는 반복 일정이면 그날, 아니면 시작일이다(기간 일정은 어느 날에서 눌러도 같은 일이다).
 *
 * @example getEventRecordLink(event, "2026-11-09") // { kind: "leave", eventDate: "2026-11-01", lastDate: "2026-11-01" }
 */
export const getEventRecordLink = (
  { date, repeatRule, period, isTogether, recordId }: Pick<CalendarEvent, "date" | "repeatRule" | "period" | "isTogether" | "recordId">,
  today: string,
): EventRecordLink | undefined => {
  if (recordId) return { kind: "view", recordId };
  if (!isTogether || (period?.end ?? date) > today) return undefined;
  return { kind: "leave", eventDate: repeatRule ? date : (period?.start ?? date), lastDate: repeatRule ? date : (period?.end ?? date) };
};

/**
 * 일정 고치기 화면의 기록 버튼. 반복 일정을 날 없이 열면 전체를 고치는 화면이라 어느 날의 기록인지 알 수 없어 보여 주지 않는다.
 *
 * @example getEditEventRecordLink(event, occurrenceDate, "2026-11-09") // { kind: "view", recordId: "r1" }
 */
export const getEditEventRecordLink = (
  event: Pick<CalendarEventRow, "date" | "repeat_rule" | "end_date" | "is_together" | "records">,
  occurrenceDate: string | undefined,
  today: string,
): EventRecordLink | undefined => {
  const repeatRule = isRepeatRule(event.repeat_rule) ? event.repeat_rule : undefined;
  const date = repeatRule ? occurrenceDate : event.date;
  if (!date) return undefined;
  const period = event.end_date ? { start: event.date, end: event.end_date } : undefined;
  return getEventRecordLink({ date, repeatRule, period, isTogether: event.is_together, recordId: findLinkedRecordId(event, date) }, today);
};

/**
 * 그날 보이는 일정에 이어진 기록을 뺀다(#228). 그 일정 줄의 "기록 보기"가 기록을 대신하므로 따로 "기록" 줄과 점을 만들지 않는다.
 * 이어진 일정이 그날 보이지 않으면(반복에서 빠진 날, 건너뛴 날, 날짜를 바꾼 일정) 기록으로 갈 길이 없어지므로 그대로 둔다.
 *
 * @example omitLinkedRecords(recordsByDate.get(date) ?? [], eventsByDate.get(date) ?? []) // 직접 쓴 기록만
 */
export const omitLinkedRecords = <Item extends { id: string }>(records: Item[], dayEvents: Pick<CalendarEvent, "recordId">[]): Item[] => {
  const linkedIds = new Set(dayEvents.flatMap(({ recordId }) => (recordId ? [recordId] : [])));
  return records.filter(({ id }) => !linkedIds.has(id));
};

/** 이미 쓴 기록을 이을 수 있는 일정의 그날(기록 상세의 "일정과 잇기", #237) */
export interface LinkableEvent extends Pick<CalendarEvent, "title" | "startTime" | "repeatRule" | "period"> {
  eventId: string;
  /** 연결 날짜. 반복 일정이면 그날, 아니면 시작일 */
  eventDate: string;
}

/**
 * 기록 기간에 보이는 일정 줄에서 기록을 이을 수 있는 일정의 그날을 고른다. 조건은 "기록 남기기"와 같다.
 * 기간 일정은 날마다 한 줄이지만 연결 날짜는 시작일 하나라서 한 번만 고른다.
 *
 * @example listLinkableEvents(expandEventRows(rows, { start: record.date, end: record.endDate ?? record.date }), today)
 */
export const listLinkableEvents = (events: CalendarEvent[], today: string): LinkableEvent[] => {
  const seen = new Set<string>();
  return events.flatMap(({ id, date, title, startTime, repeatRule, period, isTogether, recordId }) => {
    const link = getEventRecordLink({ date, repeatRule, period, isTogether, recordId }, today);
    if (link?.kind !== "leave") return [];
    const key = `${id}/${link.eventDate}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ eventId: id, eventDate: link.eventDate, title, startTime, repeatRule, period }];
  });
};

/**
 * 기록 버튼이 갈 주소. 남길 때는 일정 id와 날짜만 넘기고 채울 값은 작성 화면의 서버가 일정에서 읽는다.
 *
 * @example toEventRecordHref("e1", { kind: "leave", eventDate: "2026-11-01", lastDate: "2026-11-01" }) // "/dates/new?event=e1&eventDate=2026-11-01"
 */
export const toEventRecordHref = (eventId: string, link: EventRecordLink): string =>
  link.kind === "view" ? `/dates/${link.recordId}` : `/dates/new?${new URLSearchParams({ event: eventId, eventDate: link.eventDate }).toString()}`;

/** 기록 작성 화면에 채울 일정 한 행 */
export interface EventRecordPrefillRow extends Pick<CalendarEventRow, "id" | "date" | "title" | "is_together" | "repeat_rule" | "repeat_until" | "end_date" | "exceptions"> {
  memo: string | null;
}

/**
 * 일정의 그날로 남길 기록의 처음 값(날짜·끝 날짜·제목·메모와 연결)을 만든다. 일정의 장소는 기록에 장소 칸이 없어(#296) 넘기지 않는다.
 * 작성 화면 주소는 손으로 바꿀 수 있어서, 그날이 일정의 날(반복이면 실제로 오는 날, 아니면 시작일)이 아니거나
 * 한 사람 일정이거나 아직 끝나지 않았으면 undefined를 돌려 연결 없이 쓰게 한다.
 *
 * @example toEventRecordPrefill(row, "2026-11-01", "2026-11-09") // { date: "2026-11-01", title: "전시", ..., eventLink: { eventId: "e1", eventDate: "2026-11-01" } }
 */
export const toEventRecordPrefill = (row: EventRecordPrefillRow, eventDate: string, today: string): RecordPrefill | undefined => {
  const isEventDay = isRepeatRule(row.repeat_rule) ? findOccurrenceDate(row, eventDate) === eventDate : row.date === eventDate;
  if (!isEventDay || !row.is_together || (row.end_date ?? eventDate) > today) return undefined;
  return {
    date: eventDate,
    endDate: row.end_date ?? undefined,
    title: takeChars(row.title, TITLE_MAX_LENGTH),
    memo: row.memo ?? "",
    eventLink: { eventId: row.id, eventDate },
  };
};
