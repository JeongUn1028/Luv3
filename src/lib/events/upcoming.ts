import { countDaysBetween } from "@/lib/anniversary";
import { formatEventTime } from "@/lib/calendar/month";
import type { EventPeriod } from "./calendar";
import { formatEventPeriod } from "./recurrence";

/** 홈 일정 칸에 보여 줄 일정 수. 칸이 정사각형이라 더 넣으면 넘친다 */
const UPCOMING_PREVIEW_COUNT = 2;

/**
 * 일정이 언제인지 오늘 기준으로 쓴다.
 *
 * @example formatUpcomingDay("2026-11-14", "2026-11-03") // "11일 뒤"
 */
export const formatUpcomingDay = (date: string, today: string): string => {
  const days = countDaysBetween(today, date);
  if (days === 0) return "오늘";
  return days === 1 ? "내일" : `${days}일 뒤`;
};

/**
 * 일정 칸에 보여 줄 일정과, 보여 준 마지막 날에 못 넣은 일정 수 문구. 더 먼 날의 일정은 세지 않는다.
 *
 * @example previewUpcomingEvents(events) // { shown: [전시, 저녁], moreLabel: "외 1개" }
 */
export const previewUpcomingEvents = <Event extends { date: string }>(events: Event[]): { shown: Event[]; moreLabel: string | undefined } => {
  const shown = events.slice(0, UPCOMING_PREVIEW_COUNT);
  const lastDate = shown.at(-1)?.date;
  const hiddenCount = events.slice(UPCOMING_PREVIEW_COUNT).filter((event) => event.date === lastDate).length;
  return { shown, moreLabel: hiddenCount > 0 ? `외 ${hiddenCount}개` : undefined };
};

/**
 * 일정 칸의 일정 제목 아래 줄: 시간(또는 종일)과 장소. 기간 일정은 칸이 좁아 시간 대신 기간을 쓴다.
 *
 * @example formatEventMeta({ startTime: "19:00:00", place: "성수" }) // "19:00 · 성수"
 */
export const formatEventMeta = ({
  startTime,
  place,
  period,
}: {
  startTime: string | null;
  place: string | undefined;
  period?: EventPeriod | undefined;
}): string => {
  const when = period ? formatEventPeriod(period) : formatEventTime(startTime);
  return place ? `${when} · ${place}` : when;
};

