import { countChars, isIsoDate } from "@/lib/form";

// 글자 수 제한은 DB check 제약(마이그레이션)과 같아야 한다
export const EVENT_TITLE_MAX_LENGTH = 100;
export const EVENT_PLACE_MAX_LENGTH = 100;
export const EVENT_MEMO_MAX_LENGTH = 2000;

/** 일정 입력값. 날짜는 YYYY-MM-DD, 시간은 HH:MM(input 값) */
export interface EventDraft {
  date: string;
  isAllDay: boolean;
  startTime: string;
  title: string;
  place: string;
  memo: string;
}

/** 칸 이름 → 화면에 보여 줄 에러 문구 */
export type EventDraftErrors = Partial<Record<"date" | "startTime" | "title" | "place" | "memo", string>>;

/** `events` 행에 저장할 값 */
export interface EventValues {
  date: string;
  start_time: string | null;
  title: string;
  place: string | null;
  memo: string | null;
}

/** `events` 조회 결과 중 수정 화면에 쓰는 값 */
export type EventRow = EventValues;

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 새 일정 입력값. 달력에서 고른 날을 날짜로, 처음에는 종일 일정으로 둔다.
 *
 * @example createEmptyEventDraft("2026-11-14")
 */
export const createEmptyEventDraft = (date: string): EventDraft => ({
  date,
  isAllDay: true,
  startTime: "",
  title: "",
  place: "",
  memo: "",
});

/**
 * 저장 전에 입력값을 확인한다. 일정은 지난 날·앞으로의 날 모두 적을 수 있다. 문제가 없으면 빈 객체다.
 *
 * @example validateEventDraft(draft) // { title: "제목을 적어 주세요." }
 */
export const validateEventDraft = (draft: EventDraft): EventDraftErrors => {
  const errors: EventDraftErrors = {};
  if (!isIsoDate(draft.date)) errors.date = "날짜를 골라 주세요.";
  if (!draft.isAllDay && !TIME_PATTERN.test(draft.startTime)) errors.startTime = "시간을 골라 주세요.";

  const title = draft.title.trim();
  if (title === "") errors.title = "제목을 적어 주세요.";
  else if (countChars(title) > EVENT_TITLE_MAX_LENGTH) errors.title = "제목은 100자까지 적을 수 있어요.";
  if (countChars(draft.place.trim()) > EVENT_PLACE_MAX_LENGTH) errors.place = "장소는 100자까지 적을 수 있어요.";
  if (countChars(draft.memo.trim()) > EVENT_MEMO_MAX_LENGTH) errors.memo = "메모는 2,000자까지 적을 수 있어요.";
  return errors;
};

/**
 * 입력값을 `events` 행 값으로 바꾼다. 빈 장소·메모와 종일 일정의 시간은 null(DB 경계).
 *
 * @example await supabase.from("events").insert(toEventValues(draft))
 */
export const toEventValues = (draft: EventDraft): EventValues => ({
  date: draft.date,
  start_time: draft.isAllDay ? null : draft.startTime,
  title: draft.title.trim(),
  place: draft.place.trim() || null,
  memo: draft.memo.trim() || null,
});

/**
 * 저장된 일정을 수정 화면 입력값으로 바꾼다. DB의 time(HH:MM:SS)은 input 값(HH:MM)으로 줄인다.
 *
 * @example toEventDraft(row)
 */
export const toEventDraft = (row: EventRow): EventDraft => ({
  date: row.date,
  isAllDay: row.start_time === null,
  startTime: row.start_time?.slice(0, 5) ?? "",
  title: row.title,
  place: row.place ?? "",
  memo: row.memo ?? "",
});
