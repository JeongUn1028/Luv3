import { isIsoDate } from "@/lib/form";
import type { EventDraft, EventEditScope, EventRow } from "./form";

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
