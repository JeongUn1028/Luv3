import type { AuthorRow } from "@/lib/author";
import { toNextDay } from "@/lib/calendar/month";
import { countChars, isIsoDate } from "@/lib/form";
import { isRepeatRule, type RepeatRule } from "./calendar";

// 글자 수 제한은 DB check 제약(마이그레이션)과 같아야 한다
export const EVENT_TITLE_MAX_LENGTH = 100;
export const EVENT_PLACE_MAX_LENGTH = 100;
export const EVENT_MEMO_MAX_LENGTH = 2000;

/** 고치는 범위. 반복 중 그날만이거나, 일정 전체다(한 번짜리 일정은 늘 전체) */
export type EventEditScope = "occurrence" | "all";

/** 일정 입력값. 날짜는 YYYY-MM-DD, 시간은 HH:MM(input 값) */
export interface EventDraft {
  date: string;
  isAllDay: boolean;
  startTime: string;
  title: string;
  place: string;
  memo: string;
  /** 둘이 함께 하는 일정이면 true, 한 사람 일정이면 false */
  isTogether: boolean;
  scope: EventEditScope;
  /** 반복 규칙. 없으면 한 번짜리다 */
  repeatRule: RepeatRule | undefined;
  /** 반복이 끝나는 날(그날 포함). 비어 있으면 계속 반복한다 */
  repeatUntil: string;
}

/** 칸 이름 → 화면에 보여 줄 에러 문구 */
export type EventDraftErrors = Partial<Record<"date" | "startTime" | "title" | "place" | "memo" | "repeatUntil", string>>;

/** `events` 행에 저장할 값 */
export interface EventValues {
  date: string;
  start_time: string | null;
  title: string;
  place: string | null;
  memo: string | null;
  is_together: boolean;
  repeat_rule: RepeatRule | null;
  repeat_until: string | null;
}

/** `events` 조회 결과 중 수정 화면에 쓰는 값 */
export interface EventRow extends Omit<EventValues, "repeat_rule"> {
  repeat_rule: string | null;
}

/** 수정 화면이 읽는 `events` 행(작성자 포함) */
export interface EditableEventRow extends EventRow {
  id: string;
  /** 하루만 고쳐 따로 나온 일정이면 원래 반복 일정 */
  repeat_parent_id: string | null;
  author: AuthorRow;
  /** 반복 중 건너뛰는 날 */
  exceptions: { date: string }[];
}

/** 수정 화면에 넘기는 일정. 작성자는 닉네임만 남긴다 */
export interface EditableEvent extends Omit<EditableEventRow, "author"> {
  authorNickname: string | undefined;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * 새 일정 입력값. 달력에서 고른 날을 날짜로, 처음에는 함께 하는 종일 일정으로 둔다.
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
  isTogether: true,
  scope: "all",
  repeatRule: undefined,
  repeatUntil: "",
});

/**
 * 끝나는 날 달력에서 고를 수 있는 첫날(시작 다음 날). 시작이 비어 있으면 제한을 두지 않고 저장할 때 알린다.
 *
 * @example getMinRepeatUntil("2026-11-01") // "2026-11-02"
 */
export const getMinRepeatUntil = (date: string): string | undefined => (isIsoDate(date) ? toNextDay(date) : undefined);

const validateRepeatUntil = ({ date, scope, repeatRule, repeatUntil }: EventDraft): string | undefined => {
  if (scope === "occurrence" || !repeatRule || repeatUntil === "") return undefined;
  if (!isIsoDate(repeatUntil)) return "끝나는 날을 다시 골라 주세요.";
  return repeatUntil > date ? undefined : "끝나는 날은 시작하는 날 뒤로 골라 주세요.";
};

/**
 * 저장 전에 입력값을 확인한다. 일정은 지난 날·앞으로의 날 모두 적을 수 있다. 문제가 없으면 빈 객체다.
 *
 * @example validateEventDraft(draft) // { title: "제목을 적어 주세요." }
 */
export const validateEventDraft = (draft: EventDraft): EventDraftErrors => {
  const errors: EventDraftErrors = {};
  const repeatUntilError = validateRepeatUntil(draft);
  if (repeatUntilError) errors.repeatUntil = repeatUntilError;
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
  is_together: draft.isTogether,
  repeat_rule: draft.repeatRule ?? null,
  repeat_until: draft.repeatRule && draft.repeatUntil !== "" ? draft.repeatUntil : null,
});

/**
 * 저장된 일정을 수정 화면 입력값으로 바꾼다. DB의 time(HH:MM:SS)은 input 값(HH:MM)으로 줄인다.
 * 반복 중 오는 날을 주면 그날만 고치는 값으로 시작한다.
 *
 * @example toEventDraft(row, "2026-11-13")
 */
export const toEventDraft = (row: EventRow, occurrenceDate?: string): EventDraft => ({
  date: occurrenceDate ?? row.date,
  isAllDay: row.start_time === null,
  startTime: row.start_time?.slice(0, 5) ?? "",
  title: row.title,
  place: row.place ?? "",
  memo: row.memo ?? "",
  isTogether: row.is_together,
  scope: occurrenceDate ? "occurrence" : "all",
  repeatRule: isRepeatRule(row.repeat_rule) ? row.repeat_rule : undefined,
  repeatUntil: row.repeat_until ?? "",
});

/**
 * 고칠 범위를 바꾼다. 전체는 시작하는 날을 고치는 것이고, 이 날만은 누른 날을 옮기는 것이라 날짜를 맞춘다.
 * 이 날만은 함께 여부를 고칠 수 없으므로 전체에서 바꾼 값을 되돌린다.
 *
 * @example changeDraftScope(draft, "all", { date: "2026-11-28", startDate: "2026-11-14" }, true)
 */
export const changeDraftScope = (
  draft: EventDraft,
  scope: EventEditScope,
  occurrence: { date: string; startDate: string },
  isTogether: boolean,
): EventDraft =>
  scope === "occurrence" ? { ...draft, scope, date: occurrence.date, isTogether } : { ...draft, scope, date: occurrence.startDate };

/**
 * 수정 화면이 읽은 일정 행에서 작성자를 닉네임으로 바꾼다.
 *
 * @example const event = toEditableEvent(row); <EventForm authorNickname={event.authorNickname} />
 */
export const toEditableEvent = ({ author, ...row }: EditableEventRow): EditableEvent => ({
  ...row,
  authorNickname: author?.nickname,
});
