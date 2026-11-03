import { countDaysBetween } from "@/lib/anniversary";
import { formatDayHeading } from "@/lib/calendar/month";

/** 홈에 보여 줄 하루치 일정 */
export interface UpcomingDay<Event> {
  /** YYYY-MM-DD */
  date: string;
  /** 오늘(한국 날짜) 일정이면 true, 다음 일정이면 false */
  isToday: boolean;
  /** 그날 일정 전부. 종일 먼저, 시간 일정은 이른 시간부터 */
  events: Event[];
}

type UpcomingEvent = { date: string; startTime: string | null };

// 종일(null)을 맨 앞에 두고, HH:MM:SS는 글자 순서가 곧 시간 순서다
const compareStartTime = (left: UpcomingEvent, right: UpcomingEvent): number => {
  if (left.startTime === right.startTime) return 0;
  if (left.startTime === null) return -1;
  if (right.startTime === null) return 1;
  return left.startTime < right.startTime ? -1 : 1;
};

/**
 * 홈의 일정 칸에 보여 줄 날을 고른다. 오늘 일정이 있으면 오늘(이미 지난 시간 일정 포함), 없으면 가장 가까운 다음 날이다.
 * 누가 만든 일정이든, 함께·개인 일정이든 모두 센다. 같은 시간 일정은 받은 순서(만든 순서)를 지킨다.
 *
 * @param today 한국 날짜 YYYY-MM-DD(`toKstDate(new Date())`)
 * @returns 오늘과 그 뒤에 일정이 없으면 undefined
 * @example pickUpcomingDay(events, "2026-11-03") // { date: "2026-11-14", isToday: false, events: [...] }
 */
export const pickUpcomingDay = <Event extends UpcomingEvent>(
  events: Event[],
  today: string,
): UpcomingDay<Event> | undefined => {
  const upcoming = events.filter((event) => event.date >= today);
  if (upcoming.length === 0) return undefined;

  const date = upcoming.reduce((nearest, event) => (event.date < nearest ? event.date : nearest), upcoming[0].date);
  return {
    date,
    isToday: date === today,
    events: upcoming.filter((event) => event.date === date).toSorted(compareStartTime),
  };
};

/**
 * 일정 칸 제목과 날짜 설명. 다음 일정이면 며칠 뒤인지 덧붙인다.
 *
 * @example describeUpcomingDay("2026-11-04", "2026-11-03") // { title: "다음 일정", detail: "11월 4일 수요일 · 내일" }
 */
export const describeUpcomingDay = (date: string, today: string): { title: string; detail: string } => {
  const heading = formatDayHeading(date);
  if (date === today) return { title: "오늘 일정", detail: heading };

  const days = countDaysBetween(today, date);
  return { title: "다음 일정", detail: `${heading} · ${days === 1 ? "내일" : `${days}일 뒤`}` };
};
