import type { AuthorRow } from "@/lib/author";

/** 달력에 그리는 일정 */
export interface CalendarEvent {
  id: string;
  date: string;
  /** HH:MM:SS. null이면 종일 */
  startTime: string | null;
  title: string;
  place: string | undefined;
  authorNickname: string | undefined;
}

/** 달력에 표시하는 데이트 기록(누르면 기록 상세) */
export interface CalendarRecord {
  id: string;
  date: string;
  title: string;
  authorNickname: string | undefined;
}

/** `events` 조회 결과 한 행 */
export interface CalendarEventRow {
  id: string;
  date: string;
  start_time: string | null;
  title: string;
  place: string | null;
  author: AuthorRow;
}

/** `dates` 조회 결과 한 행 */
export interface CalendarRecordRow {
  id: string;
  date: string;
  title: string;
  author: AuthorRow;
}

/**
 * 일정 행을 달력 값으로 바꾼다. DB의 null은 화면 경계에서 undefined로 바꾼다(시작 시간의 null은 "종일"이라 그대로 둔다).
 *
 * @example eventsResult.data.map(toCalendarEvent)
 */
export const toCalendarEvent = ({ id, date, start_time, title, place, author }: CalendarEventRow): CalendarEvent => ({
  id,
  date,
  startTime: start_time,
  title,
  place: place ?? undefined,
  authorNickname: author?.nickname,
});

/**
 * 기록 행을 달력 값으로 바꾼다.
 *
 * @example recordsResult.data.map(toCalendarRecord)
 */
export const toCalendarRecord = ({ id, date, title, author }: CalendarRecordRow): CalendarRecord => ({
  id,
  date,
  title,
  authorNickname: author?.nickname,
});
