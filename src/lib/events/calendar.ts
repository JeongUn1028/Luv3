import type { AuthorRow } from "@/lib/author";

/** 일정의 반복 규칙. 값은 DB check 제약(마이그레이션)과 같아야 한다 */
export type RepeatRule = "weekly" | "monthly" | "yearly";

/** 기간 일정의 시작일과 끝 날짜(YYYY-MM-DD) */
export interface EventPeriod {
  start: string;
  end: string;
}

/** 달력에 그리는 일정. 반복 일정은 오는 날마다 한 줄이고 id는 같다 */
export interface CalendarEvent {
  id: string;
  date: string;
  /** 반복 일정이면 규칙, 한 번짜리면 undefined */
  repeatRule: RepeatRule | undefined;
  /** 기간 일정이면 시작일과 끝 날짜(양 끝 포함), 하루 일정이면 undefined. `date`는 기간 중 이 줄이 나오는 날이다 */
  period: EventPeriod | undefined;
  /** HH:MM:SS. null이면 종일 */
  startTime: string | null;
  title: string;
  place: string | undefined;
  /** 둘이 함께 하는 일정이면 true(분홍 형광펜), 한 사람 일정이면 false(크림색 형광펜) */
  isTogether: boolean;
  authorNickname: string | undefined;
}

/** 달력에 표시하는 데이트 기록(누르면 기록 상세) */
export interface CalendarRecord {
  id: string;
  /** 기간이면 시작일 */
  date: string;
  /** 기간의 끝 날짜. 하루짜리면 undefined */
  endDate: string | undefined;
  title: string;
  authorNickname: string | undefined;
}

/**
 * 한 사람 일정의 주인 이름. 작성자를 모르면 내 닉네임으로 대신하지 않는다(상대 일정에 내 이름이 붙을 수 있다).
 *
 * @example toOwnerLabel("정운") // "정운"
 * @example toOwnerLabel(undefined) // "한 사람"
 */
export const toOwnerLabel = (authorNickname: string | undefined): string => authorNickname ?? "한 사람";

/** `events` 조회 결과 한 행 */
export interface CalendarEventRow {
  id: string;
  date: string;
  start_time: string | null;
  title: string;
  place: string | null;
  is_together: boolean;
  repeat_rule: string | null;
  repeat_until: string | null;
  end_date: string | null;
  created_at: string;
  author: AuthorRow;
  /** 반복 중 건너뛰는 날 */
  exceptions: { date: string }[];
}

/** `dates` 조회 결과 한 행 */
export interface CalendarRecordRow {
  id: string;
  date: string;
  end_date: string | null;
  title: string;
  author: AuthorRow;
}

/**
 * DB의 반복 규칙 값인지 확인한다.
 *
 * @example isRepeatRule("weekly") // true
 */
export const isRepeatRule = (value: string | null): value is RepeatRule =>
  value === "weekly" || value === "monthly" || value === "yearly";

/**
 * 일정 행을 달력 값으로 바꾼다. DB의 null은 화면 경계에서 undefined로 바꾼다(시작 시간의 null은 "종일"이라 그대로 둔다).
 *
 * @example eventsResult.data.map(toCalendarEvent)
 */
export const toCalendarEvent = ({
  id,
  date,
  start_time,
  title,
  place,
  is_together,
  repeat_rule,
  end_date,
  author,
}: CalendarEventRow): CalendarEvent => ({
  id,
  date,
  repeatRule: isRepeatRule(repeat_rule) ? repeat_rule : undefined,
  period: end_date ? { start: date, end: end_date } : undefined,
  startTime: start_time,
  title,
  place: place ?? undefined,
  isTogether: is_together,
  authorNickname: author?.nickname,
});

/**
 * 기록 행을 달력 값으로 바꾼다.
 *
 * @example recordsResult.data.map(toCalendarRecord)
 */
export const toCalendarRecord = ({ id, date, end_date, title, author }: CalendarRecordRow): CalendarRecord => ({
  id,
  date,
  endDate: end_date ?? undefined,
  title,
  authorNickname: author?.nickname,
});
