import { isIsoDate } from "@/lib/form";

/** 달력 한 칸 */
export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  day: number;
  /** 보고 있는 달의 날인지(앞뒤 달 날은 흐리게 그린다) */
  isCurrentMonth: boolean;
}

/** 달력 머리글. 달력은 모두 일요일부터 시작한다 */
export const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;
const DAY_MS = 24 * 60 * 60 * 1000;

// 날짜만 다루므로 시간대 영향을 받지 않게 UTC 자정으로 계산한다
const toUtc = (isoDate: string): Date => new Date(`${isoDate}T00:00:00Z`);

/**
 * UTC 자정으로 계산한 날짜를 YYYY-MM-DD로 바꾼다.
 *
 * @example toIsoDate(new Date(Date.UTC(2026, 10, 2))) // "2026-11-02"
 */
export const toIsoDate = (date: Date): string => date.toISOString().slice(0, 10);

/**
 * 주소의 `month` 값(YYYY-MM)을 읽는다. 없거나 형식이 틀리면 오늘(한국 날짜)이 속한 달로 본다.
 *
 * @example parseMonth("2026-12", "2026-11-02") // "2026-12"
 */
export const parseMonth = (value: string | string[] | undefined, today: string): string =>
  typeof value === "string" && MONTH_PATTERN.test(value) ? value : today.slice(0, 7);

/**
 * 달을 앞뒤로 옮긴다.
 *
 * @example shiftMonth("2026-12", 1) // "2027-01"
 */
export const shiftMonth = (month: string, offset: number): string => {
  const date = toUtc(`${month}-01`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return toIsoDate(date).slice(0, 7);
};

/**
 * 요일 번호. 0이 일요일, 6이 토요일이다(`WEEKDAYS` 순서).
 *
 * @example getWeekday("2026-11-14") // 6
 */
export const getWeekday = (isoDate: string): number => toUtc(isoDate).getUTCDay();

/**
 * 일요일부터 시작하는 주 단위 달력 칸을 만든다. 첫 주와 마지막 주는 앞뒤 달 날로 채운다(4~6주).
 *
 * @example buildMonthGrid("2026-11")[0][0] // { date: "2026-11-01", day: 1, isCurrentMonth: true }
 */
export const buildMonthGrid = (month: string): CalendarDay[][] => {
  const first = toUtc(`${month}-01`);
  const start = new Date(first.getTime() - first.getUTCDay() * DAY_MS);
  const weeks: CalendarDay[][] = [];

  for (let cursor = start; weeks.length === 0 || toIsoDate(cursor).slice(0, 7) === month; ) {
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(cursor.getTime() + index * DAY_MS);
      const isoDate = toIsoDate(date);
      return { date: isoDate, day: date.getUTCDate(), isCurrentMonth: isoDate.startsWith(month) };
    });
    weeks.push(week);
    cursor = new Date(cursor.getTime() + 7 * DAY_MS);
  }
  return weeks;
};

/**
 * 처음 고를 날: 주소로 받은 날(일정을 저장하고 돌아온 날)이 보는 달의 실제 날이면 그날,
 * 아니면 보는 달에 오늘이 있으면 오늘, 없으면 그 달 1일.
 *
 * @example getDefaultSelectedDate("2026-12", "2026-11-02") // "2026-12-01"
 */
export const getDefaultSelectedDate = (
  month: string,
  today: string,
  requested?: string | string[],
): string => {
  if (typeof requested === "string" && requested.startsWith(`${month}-`) && isIsoDate(requested)) return requested;
  return today.startsWith(month) ? today : `${month}-01`;
};

/**
 * 달 제목. 앨범 그리드와 같은 표기다.
 *
 * @example formatMonthTitle("2026-11") // "2026 · 11"
 */
export const formatMonthTitle = (month: string): string => month.replace("-", " · ");

const DAY_HEADING_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  month: "long",
  day: "numeric",
  weekday: "long",
  timeZone: "UTC",
});

/**
 * 고른 날 제목.
 *
 * @example formatDayHeading("2026-11-02") // "11월 2일 월요일"
 */
export const formatDayHeading = (isoDate: string): string => DAY_HEADING_FORMAT.format(toUtc(isoDate));

/**
 * 일정 시간 표기. DB의 time 값(HH:MM:SS)에서 초를 뗀다.
 *
 * @example formatEventTime("19:30:00") // "19:30"
 */
export const formatEventTime = (startTime: string | null): string => (startTime ? startTime.slice(0, 5) : "종일");

/**
 * 달력에 그리는 첫 칸과 마지막 칸 날짜. 이 범위의 일정·기록을 한 번에 읽는다.
 *
 * @example getGridRange("2026-11") // { start: "2026-11-01", end: "2026-12-05" }
 */
export const getGridRange = (month: string): { start: string; end: string } => {
  const days = buildMonthGrid(month).flat();
  return { start: days[0]?.date ?? `${month}-01`, end: days.at(-1)?.date ?? `${month}-01` };
};

/**
 * 날짜를 며칠 앞뒤로 옮긴다. 달과 해가 바뀌어도 맞다.
 *
 * @example addDays("2026-11-30", 1) // "2026-12-01"
 */
export const addDays = (isoDate: string, days: number): string => toIsoDate(new Date(toUtc(isoDate).getTime() + days * DAY_MS));

/**
 * 다음 날. 달과 해가 바뀌어도 맞다.
 *
 * @example toNextDay("2026-12-31") // "2027-01-01"
 */
export const toNextDay = (isoDate: string): string => addDays(isoDate, 1);

/**
 * 날짜마다 묶는다. 끝 날짜가 있으면(기간 기록) 기간의 모든 날에 넣는다. 같은 날 안에서는 받은 순서를 지킨다.
 *
 * @example groupByDate(events).get("2026-11-14") // [...]
 */
export const groupByDate = <Item extends { date: string; endDate?: string | undefined }>(items: Item[]): Map<string, Item[]> => {
  const grouped = new Map<string, Item[]>();
  for (const item of items) {
    const lastDate = item.endDate ?? item.date;
    for (let date = item.date; date <= lastDate; date = toNextDay(date)) {
      grouped.set(date, [...(grouped.get(date) ?? []), item]);
    }
  }
  return grouped;
};

/** 캘린더 탭 주소 */
export const CALENDAR_PATH = "/calendar";

/** 캘린더 탭에서 열 달·고를 날 */
export interface CalendarHrefParams {
  /** 열 달 YYYY-MM. 없으면 `date`가 속한 달, 둘 다 없으면 이번 달 */
  month?: string;
  /** 고를 날 YYYY-MM-DD(일정을 저장하고 돌아온 날) */
  date?: string;
}

/**
 * 캘린더 탭 주소를 만든다. 날만 주면 그날이 속한 달을 연다.
 *
 * @example toCalendarHref({ date: "2026-11-20" }) // "/calendar?month=2026-11&date=2026-11-20"
 */
export const toCalendarHref = ({ month, date }: CalendarHrefParams): string => {
  const params = new URLSearchParams();
  const targetMonth = month ?? date?.slice(0, 7);
  if (targetMonth) params.set("month", targetMonth);
  if (date) params.set("date", date);
  const search = params.toString();
  return search ? `${CALENDAR_PATH}?${search}` : CALENDAR_PATH;
};
