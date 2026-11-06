import { toIsoDate, toNextDay } from "@/lib/calendar/month";
import { formatPeriodMonthDay } from "@/lib/dates/album";
import { isIsoDate } from "@/lib/form";
import { isRepeatRule, toCalendarEvent, type CalendarEvent, type CalendarEventRow, type EventPeriod, type RepeatRule } from "./calendar";

/** 날짜 범위. 양 끝을 포함한다(YYYY-MM-DD) */
export interface DateRange {
  start: string;
  end: string;
}

interface RepeatSeries {
  /** 반복을 시작한 날 */
  date: string;
  repeatRule: RepeatRule;
  /** 이 날까지 반복한다(포함). null이면 계속 반복한다 */
  repeatUntil: string | null;
  /** 건너뛰는 날 */
  exceptionDates: string[];
}

const REPEAT_RULE_LABELS: Record<RepeatRule, string> = { weekly: "매주", monthly: "매달", yearly: "매년" };

/** 고를 수 있는 반복 규칙(선택지 순서) */
export const REPEAT_RULES = ["weekly", "monthly", "yearly"] as const satisfies readonly RepeatRule[];

const DAYS_PER_WEEK = 7;
const MONTHS_PER_YEAR = 12;

// 해당 달에 그 날이 없으면 마지막 날로 옮긴다. 다음 달 0일이 이번 달 마지막 날이다
const toClampedDate = (year: number, month: number, day: number): string => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return toIsoDate(new Date(Date.UTC(year, month, Math.min(day, lastDay))));
};

// 앞선 결과에 더하지 않고 시작일에서 바로 계산해야, 31일 일정이 2월을 지나도 28일로 굳지 않는다
const getNthOccurrence = (start: string, rule: RepeatRule, index: number): string => {
  const [year, month, day] = start.split("-").map(Number) as [number, number, number];
  const monthIndex = month - 1;
  if (rule === "weekly") return toIsoDate(new Date(Date.UTC(year, monthIndex, day + index * DAYS_PER_WEEK)));
  const monthOffset = rule === "monthly" ? index : index * MONTHS_PER_YEAR;
  return toClampedDate(year, monthIndex + monthOffset, day);
};

/**
 * 반복 일정이 범위 안에서 오는 날을 빠른 날부터 돌려준다. 그 달에 없는 날은 그 달의 마지막 날로 옮긴다.
 *
 * @example listOccurrenceDates({ date: "2027-01-31", repeatRule: "monthly", repeatUntil: null, exceptionDates: [] }, { start: "2027-02-01", end: "2027-02-28" }) // ["2027-02-28"]
 */
export const listOccurrenceDates = (
  { date, repeatRule, repeatUntil, exceptionDates }: RepeatSeries,
  { start, end }: DateRange,
): string[] => {
  const lastDate = repeatUntil !== null && repeatUntil < end ? repeatUntil : end;
  const skipped = new Set(exceptionDates);
  const dates: string[] = [];
  for (let index = 0; ; index += 1) {
    const occurrence = getNthOccurrence(date, repeatRule, index);
    if (occurrence > lastDate || isBeyondCalendar(occurrence)) return dates;
    if (occurrence >= start && !skipped.has(occurrence)) dates.push(occurrence);
  }
};

// 9999년 뒤의 날짜는 "+010000-..."로 쓰여 글자 비교로는 앞선 날로 보이므로 따로 끝낸다
const isBeyondCalendar = (isoDate: string): boolean => isoDate.startsWith("+");

// 건너뛰는 날은 정해진 수뿐이므로, 끝나는 날이 없는 반복도 언젠가 다음 날을 찾아 끝난다
const getNextOccurrenceDate = ({ date, repeatRule, repeatUntil, exceptionDates }: RepeatSeries, from: string): string | undefined => {
  const skipped = new Set(exceptionDates);
  for (let index = 0; ; index += 1) {
    const occurrence = getNthOccurrence(date, repeatRule, index);
    if ((repeatUntil !== null && occurrence > repeatUntil) || isBeyondCalendar(occurrence)) return undefined;
    if (occurrence >= from && !skipped.has(occurrence)) return occurrence;
  }
};

const toRepeatSeries = (
  { date, repeat_until, exceptions }: Pick<CalendarEventRow, "date" | "repeat_until" | "exceptions">,
  repeatRule: RepeatRule,
): RepeatSeries => ({
  date,
  repeatRule,
  repeatUntil: repeat_until,
  exceptionDates: exceptions.map((exception) => exception.date),
});

// 기간 일정은 범위와 겹치는 날 모두, 하루 일정은 끝 날짜가 없어 그날 하나다
const listSpanDates = ({ date, end_date }: Pick<CalendarEventRow, "date" | "end_date">, { start, end }: DateRange): string[] => {
  const dates: string[] = [];
  const lastDate = end_date ?? date;
  for (let day = date < start ? start : date; day <= lastDate && day <= end; day = toNextDay(day)) dates.push(day);
  return dates;
};

const listRowDates = (row: CalendarEventRow, range: DateRange): string[] =>
  isRepeatRule(row.repeat_rule) ? listOccurrenceDates(toRepeatSeries(row, row.repeat_rule), range) : listSpanDates(row, range);

const getNextRowDate = (row: CalendarEventRow, from: string): string | undefined => {
  if (isRepeatRule(row.repeat_rule)) return getNextOccurrenceDate(toRepeatSeries(row, row.repeat_rule), from);
  if (row.date >= from) return row.date;
  // 이미 시작한 기간 일정은 끝나기 전까지 from에도 이어진다
  return row.end_date !== null && row.end_date >= from ? from : undefined;
};

// 구분 문자 공백은 숫자보다 앞서서 시간 없는(종일) 일정이 먼저 온다. HH:MM:SS는 글자 순서가 곧 시간 순서다
const toSortKey = (row: CalendarEventRow, date: string, startTime: string | null): string => `${date} ${startTime ?? ""} ${row.created_at}`;

// 기간 일정의 시작 시간은 첫날의 것이다. 이어지는 날은 시작이 지났으므로 종일로 본다
const getStartTimeOn = (row: CalendarEventRow, date: string): string | null => (row.end_date && date !== row.date ? null : row.start_time);

/**
 * 조회한 일정 행을 범위 안의 날마다(반복은 오는 날마다, 기간은 기간의 모든 날마다) 한 줄씩 펼쳐 날짜 → 종일 먼저 → 시간 → 만든 순서로 돌려준다.
 *
 * @example expandEventRows(data, getGridRange("2026-11"))
 */
export const expandEventRows = (rows: CalendarEventRow[], range: DateRange): CalendarEvent[] =>
  rows
    .flatMap((row) => {
      const event = toCalendarEvent(row);
      return listRowDates(row, range).map((date) => {
        const startTime = getStartTimeOn(row, date);
        return { event: { ...event, date, startTime }, key: toSortKey(row, date, startTime) };
      });
    })
    .toSorted((left, right) => (left.key < right.key ? -1 : left.key > right.key ? 1 : 0))
    .map(({ event }) => event);

/**
 * 오늘 또는 그 뒤로 가장 가까운 날의 일정만 펼쳐 돌려준다(홈). 일정이 얼마나 먼 날에 있어도 찾고, 그 뒤의 날은 계산하지 않는다.
 *
 * @example expandUpcomingEventRows(data, "2026-11-06")
 */
export const expandUpcomingEventRows = (rows: CalendarEventRow[], today: string): CalendarEvent[] => {
  const nearestDate = rows
    .map((row) => getNextRowDate(row, today))
    .reduce<string | undefined>((nearest, date) => (date && (!nearest || date < nearest) ? date : nearest), undefined);
  return nearestDate ? expandEventRows(rows, { start: today, end: nearestDate }) : [];
};

/**
 * 고치기 주소의 날이 반복 일정이 실제로 오는 날이면 그날을 돌려준다. 건너뛰었거나 없는 날이면 undefined다.
 *
 * @example findOccurrenceDate(event, searchParams.date) // "2026-11-13"
 */
export const findOccurrenceDate = (
  event: Pick<CalendarEventRow, "date" | "repeat_rule" | "repeat_until" | "exceptions">,
  requested: string | string[] | undefined,
): string | undefined => {
  if (!isRepeatRule(event.repeat_rule) || typeof requested !== "string" || !isIsoDate(requested)) return undefined;
  return listOccurrenceDates(toRepeatSeries(event, event.repeat_rule), { start: requested, end: requested })[0];
};

/**
 * 일정 고치기 주소. 반복·기간 일정은 어느 날을 눌렀는지 함께 담는다.
 *
 * @example toEventEditHref({ id: "e1", date: "2026-11-13", repeatRule: "weekly", period: undefined }) // "/events/e1/edit?date=2026-11-13"
 */
export const toEventEditHref = ({ id, date, repeatRule, period }: Pick<CalendarEvent, "id" | "date" | "repeatRule" | "period">): string =>
  repeatRule || period ? `/events/${id}/edit?date=${date}` : `/events/${id}/edit`;

/**
 * 기간 일정의 짧은 기간 표기. 기록 그리드와 같은 모양이다.
 *
 * @example formatEventPeriod({ start: "2026-10-30", end: "2026-11-01" }) // "10.30–11.01"
 */
export const formatEventPeriod = ({ start, end }: EventPeriod): string => formatPeriodMonthDay({ date: start, endDate: end });

/**
 * 반복 규칙을 화면 문구로 바꾼다.
 *
 * @example formatRepeatRule("weekly") // "매주"
 */
export const formatRepeatRule = (rule: RepeatRule): string => REPEAT_RULE_LABELS[rule];
