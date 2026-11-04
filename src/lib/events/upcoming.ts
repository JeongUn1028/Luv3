import { countDaysBetween } from "@/lib/anniversary";
import { formatDayHeading, formatEventTime } from "@/lib/calendar/month";
import { toOwnerLabel } from "./calendar";

/** 홈 일정 칸에 보여 줄 일정 수. 칸이 정사각형이라 더 넣으면 넘친다 */
const UPCOMING_PREVIEW_COUNT = 2;

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
 * 누가 만든 일정이든, 함께 일정이든 한 사람 일정이든 모두 센다. 같은 시간 일정은 받은 순서(만든 순서)를 지킨다.
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
 * 일정 칸의 제목, 날짜, 며칠 뒤인지. 오늘 일정이면 며칠 뒤인지는 없다.
 *
 * @example describeUpcomingDay("2026-11-14", "2026-11-03") // { title: "다음 일정", dateLabel: "11월 14일 토요일", relativeLabel: "11일 뒤" }
 */
export const describeUpcomingDay = (
  date: string,
  today: string,
): { title: string; dateLabel: string; relativeLabel: string | undefined } => {
  const dateLabel = formatDayHeading(date);
  if (date === today) return { title: "오늘 일정", dateLabel, relativeLabel: undefined };

  const days = countDaysBetween(today, date);
  return { title: "다음 일정", dateLabel, relativeLabel: days === 1 ? "내일" : `${days}일 뒤` };
};

/**
 * 일정 칸에 보여 줄 일정과, 칸에 못 넣은 일정 수 문구.
 *
 * @example previewUpcomingEvents(["전시", "저녁", "영화"]) // { shown: ["전시", "저녁"], moreLabel: "외 1개" }
 */
export const previewUpcomingEvents = <Event>(events: Event[]): { shown: Event[]; moreLabel: string | undefined } => {
  const hiddenCount = events.length - UPCOMING_PREVIEW_COUNT;
  return {
    shown: events.slice(0, UPCOMING_PREVIEW_COUNT),
    moreLabel: hiddenCount > 0 ? `외 ${hiddenCount}개` : undefined,
  };
};

/**
 * 일정 칸의 일정 제목 아래 줄: 시간(또는 종일)과 장소.
 *
 * @example formatEventMeta({ startTime: "19:00:00", place: "성수" }) // "19:00 · 성수"
 */
export const formatEventMeta = ({ startTime, place }: { startTime: string | null; place: string | undefined }): string => {
  const time = formatEventTime(startTime);
  return place ? `${time} · ${place}` : time;
};

/**
 * 일정 칸에서 누구 일정인지 쓰는 글자: 함께 일정은 "함께", 한 사람 일정은 작성자 닉네임.
 *
 * @example formatEventOwner({ isTogether: false, authorNickname: "정운" }) // "정운"
 */
export const formatEventOwner = ({
  isTogether,
  authorNickname,
}: {
  isTogether: boolean;
  authorNickname: string | undefined;
}): string => (isTogether ? "함께" : toOwnerLabel(authorNickname));
