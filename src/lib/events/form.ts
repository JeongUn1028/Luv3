import type { AuthorRow } from "@/lib/author";
import { toNextDay } from "@/lib/calendar/month";
import { countChars, isIsoDate } from "@/lib/form";
import { isRepeatRule, type LinkedRecordRow, type RepeatRule } from "./calendar";

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
  /** 기간 일정의 끝 날짜. undefined면 하루 일정, 빈 문자열이면 기간을 켰지만 아직 고르지 않은 상태다 */
  endDate: string | undefined;
  /** 새 일정을 저장하다 실패했을 때 쓴 id. 다시 저장할 때 같은 값을 써서 앞선 시도가 저장했어도 일정이 둘이 되지 않는다 */
  newEventId?: string;
  /** 저장해도 되는 판 번호: 불러온 판과, 저장됐을 수 있는 내 앞선 시도의 판. 이 밖이면 상대가 고친 것이라 거부된다(#161) */
  expectedRevisions?: string[];
  /** 상대가 먼저 고쳐 저장이 거부됐는지. 다시 저장해도 거부되므로 최신 내용을 불러오게 한다 */
  hasConflict?: boolean;
}

/**
 * 쓴 내용만 남긴다. 저장을 다시 시도하려고 남긴 값(id·판 번호·거부 여부)은 쓴 내용이 아니라서, 떠날 때 경고할지 견줄 때 뺀다.
 *
 * @example const shouldConfirmLeave = !isSameFormValue(toWrittenFields(draft), toWrittenFields(baseDraft))
 */
export const toWrittenFields = (draft: EventDraft): EventDraft => ({
  ...draft,
  newEventId: undefined,
  expectedRevisions: undefined,
  hasConflict: undefined,
});

/** 칸 이름 → 화면에 보여 줄 에러 문구 */
export type EventDraftErrors = Partial<Record<"date" | "startTime" | "title" | "place" | "memo" | "repeatUntil" | "endDate", string>>;

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
  end_date: string | null;
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
  /** 판 번호. 고치기 화면을 연 뒤 다른 저장이 있었는지 알아본다(#161) */
  revision: string;
  author: AuthorRow;
  /** 반복 중 건너뛰는 날 */
  exceptions: { date: string }[];
  /** 이 일정에서 남긴 기록(#227) */
  records: LinkedRecordRow[];
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
  endDate: undefined,
});

/**
 * 끝나는 날·끝 날짜 달력에서 고를 수 있는 첫날(시작 다음 날). 시작이 비어 있으면 제한을 두지 않고 저장할 때 알린다.
 *
 * @example getMinDateAfterStart("2026-11-01") // "2026-11-02"
 */
export const getMinDateAfterStart = (date: string): string | undefined => (isIsoDate(date) ? toNextDay(date) : undefined);

const validateRepeatUntil = ({ date, scope, repeatRule, repeatUntil }: EventDraft): string | undefined => {
  if (scope === "occurrence" || !repeatRule || repeatUntil === "") return undefined;
  if (!isIsoDate(repeatUntil)) return "끝나는 날을 다시 골라 주세요.";
  return repeatUntil > date ? undefined : "끝나는 날은 시작하는 날 뒤로 골라 주세요.";
};

const validateEndDate = ({ date, scope, repeatRule, endDate }: EventDraft): string | undefined => {
  // 이 날만 고칠 때는 칸이 없고, 반복 일정에는 끝 날짜를 저장하지 않는다(toEventValues)
  if (scope === "occurrence" || endDate === undefined || repeatRule) return undefined;
  if (!isIsoDate(endDate)) return "끝 날짜를 골라 주세요.";
  return endDate > date ? undefined : "끝 날짜는 시작 날짜보다 뒤여야 해요.";
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
  const endDateError = validateEndDate(draft);
  if (endDateError) errors.endDate = endDateError;
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
  // 기간과 반복은 함께 쓰지 못한다(DB 제약 events_end_date_without_repeat)
  end_date: draft.repeatRule ? null : (draft.endDate ?? null),
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
  endDate: row.end_date ?? undefined,
});

/**
 * 범위마다 마지막으로 고른 날짜와 함께 여부. 범위를 바꿨다 돌아오면 고쳐 둔 값을 되살린다(#261).
 *
 * @example const scopeValues: ScopeValues = { occurrence: { date: "2026-11-30", isTogether: true } };
 */
export type ScopeValues = Partial<Record<EventEditScope, Pick<EventDraft, "date" | "isTogether">>>;

interface ChangeDraftScopeParams {
  draft: EventDraft;
  scope: EventEditScope;
  /** 누른 날과 반복이 시작하는 날 */
  occurrence: { date: string; startDate: string };
  /** 반복 전체의 함께 여부 */
  isTogether: boolean;
  scopeValues: ScopeValues;
}

/**
 * 고칠 범위를 바꾼다. 전체는 시작하는 날을 고치는 것이고, 이 날만은 누른 날을 옮기는 것이라 날짜를 맞춘다.
 * 이 날만은 함께 여부를 고칠 수 없으므로 반복 전체의 값으로 되돌린다.
 * 그 범위에서 고쳐 둔 날짜·함께 여부가 있으면 그 값으로 되돌리고, 떠나는 범위의 값은 `scopeValues`에 남긴다.
 *
 * @example
 * const changed = changeDraftScope({ draft, scope: "all", occurrence: { date: "2026-11-28", startDate: "2026-11-14" }, isTogether: true, scopeValues });
 * setDraft(changed.draft);
 * setScopeValues(changed.scopeValues);
 */
export const changeDraftScope = ({ draft, scope, occurrence, isTogether, scopeValues }: ChangeDraftScopeParams): { draft: EventDraft; scopeValues: ScopeValues } => {
  const nextScopeValues: ScopeValues = { ...scopeValues, [draft.scope]: { date: draft.date, isTogether: draft.isTogether } };
  const nextDraft: EventDraft =
    scope === "occurrence"
      ? { ...draft, scope, date: nextScopeValues.occurrence?.date ?? occurrence.date, isTogether }
      : { ...draft, scope, ...(nextScopeValues.all ?? { date: occurrence.startDate }) };
  return { draft: nextDraft, scopeValues: nextScopeValues };
};

/**
 * 고치기 주소의 날이 기간 일정 안이면 그날을 돌려준다(캘린더에서 누른 날). 하루 일정이거나 기간 밖이면 undefined다.
 *
 * @example findViewedPeriodDate({ date: "2026-10-30", end_date: "2026-11-02" }, "2026-11-01") // "2026-11-01"
 */
export const findViewedPeriodDate = (
  { date, end_date }: Pick<EventRow, "date" | "end_date">,
  requested: string | string[] | undefined,
): string | undefined =>
  end_date !== null && typeof requested === "string" && isIsoDate(requested) && date <= requested && requested <= end_date ? requested : undefined;

/**
 * 저장한 뒤 캘린더에서 고를 날. 시작하는 날이 다른 달이어도 보고 있던 날로 돌아가고, 그날에 일정이 더는 없으면 일정의 날짜로 돌아간다.
 *
 * @example getDateAfterSave(draft, { occurrenceDate: "2026-11-28" }) // "2026-11-28"
 */
export const getDateAfterSave = (
  { date, endDate, scope }: EventDraft,
  { occurrenceDate, viewedDate }: { occurrenceDate?: string | undefined; viewedDate?: string | undefined },
): string => {
  if (occurrenceDate && scope === "all") return occurrenceDate;
  return viewedDate && date <= viewedDate && viewedDate <= (endDate || date) ? viewedDate : date;
};

/**
 * 수정 화면이 읽은 일정 행에서 작성자를 닉네임으로 바꾼다.
 *
 * @example const event = toEditableEvent(row); <EventForm authorNickname={event.authorNickname} />
 */
export const toEditableEvent = ({ author, ...row }: EditableEventRow): EditableEvent => ({
  ...row,
  authorNickname: author?.nickname,
});
