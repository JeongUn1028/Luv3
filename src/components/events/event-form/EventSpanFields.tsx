"use client";

import type { Dispatch, ReactElement, SetStateAction } from "react";
import { DateField, FIELD_LABEL_CLASS_NAME, TextField } from "@/components/FormField";
import { isRepeatRule } from "@/lib/events/calendar";
import { getMinDateAfterStart, type EventDraft, type EventDraftErrors } from "@/lib/events/form";
import { formatRepeatRule, REPEAT_RULES } from "@/lib/events/recurrence";
import { clearError, toPeriodEndDate } from "@/lib/form";

/** 글자로 쓰는 일정 칸 */
export type EventTextField = "date" | "startTime" | "title" | "place" | "memo" | "repeatUntil" | "endDate";

interface EventSpanFieldsProps {
  draft: EventDraft;
  errors: EventDraftErrors;
  isDisabled: boolean;
  /** 반복과 기간을 바꿀 수 있는지. 이 날만 고칠 때와 따로 나온 일정은 바꾸지 않는다 */
  canEditSpan: boolean;
  setDraft: Dispatch<SetStateAction<EventDraft>>;
  setErrors: Dispatch<SetStateAction<EventDraftErrors>>;
  /** 글자 칸을 바꾼다. 그 칸의 오류도 지운다 */
  onFieldChange: (field: EventTextField, value: string) => void;
}

/**
 * 일정이 이어지는 모양을 고르는 칸: 종일·기간·반복과 끝 날짜·시간·반복이 끝나는 날.
 *
 * @example <EventSpanFields draft={draft} errors={errors} isDisabled={isSaving} canEditSpan setDraft={setDraft} setErrors={setErrors} onFieldChange={updateField} />
 */
export const EventSpanFields = ({ draft, errors, isDisabled, canEditSpan, setDraft, setErrors, onFieldChange }: EventSpanFieldsProps): ReactElement => {
  const isPeriod = draft.endDate !== undefined;

  const handlePeriodChange = (isChecked: boolean) => {
    setDraft((current) => ({ ...current, endDate: toPeriodEndDate(isChecked) }));
    setErrors((current) => clearError(current, "endDate"));
  };

  return (
    <div className="flex flex-col">
      {/* 기간과 반복을 같은 줄에 두어 폼 높이가 늘지 않게 한다. 일정 폼은 높이 여유가 거의 없다(#57) */}
      <div className="flex h-11 items-center justify-between gap-3">
        <div className="flex items-center gap-4">
          <label className="flex h-11 items-center gap-2 text-[15px] text-ink">
            <input
              type="checkbox"
              checked={draft.isAllDay}
              disabled={isDisabled}
              onChange={(event) => {
                const isAllDay = event.target.checked;
                setDraft((current) => ({ ...current, isAllDay }));
                setErrors((current) => clearError(current, "startTime"));
              }}
              className="size-5 accent-accent"
            />
            종일
          </label>
          {canEditSpan && (
            <label className="flex h-11 items-center gap-2 text-[15px] text-ink has-disabled:opacity-50">
              <input
                type="checkbox"
                checked={isPeriod}
                disabled={isDisabled || Boolean(draft.repeatRule)}
                onChange={(event) => handlePeriodChange(event.target.checked)}
                className="size-5 accent-accent"
              />
              기간
            </label>
          )}
        </div>
        {canEditSpan && (
          <label htmlFor="event-repeat" className="flex h-11 min-w-0 items-center gap-2 text-[13px] text-ink-sub has-disabled:opacity-50">
            반복
            <select
              id="event-repeat"
              value={draft.repeatRule ?? ""}
              disabled={isDisabled || isPeriod}
              onChange={(event) => {
                const { value } = event.target;
                setDraft((current) => ({ ...current, repeatRule: isRepeatRule(value) ? value : undefined }));
                setErrors((current) => clearError(current, "repeatUntil"));
              }}
              className="h-11 min-w-0 rounded-[10px] bg-transparent text-ink focus:outline-accent"
            >
              <option value="">안 함</option>
              {REPEAT_RULES.map((rule) => (
                <option key={rule} value={rule}>
                  {formatRepeatRule(rule)}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {canEditSpan && (isPeriod || draft.repeatRule) && <p className={FIELD_LABEL_CLASS_NAME}>기간과 반복은 함께 쓸 수 없어요.</p>}
      {canEditSpan && isPeriod && (
        <DateField
          id="event-end-date"
          label="끝 날짜"
          min={getMinDateAfterStart(draft.date)}
          value={draft.endDate ?? ""}
          openDate={draft.date}
          isDisabled={isDisabled}
          error={errors.endDate}
          onChange={(date) => onFieldChange("endDate", date)}
          className="mt-3"
        />
      )}
      {!draft.isAllDay && (
        <TextField
          id="event-time"
          label="시간"
          type="time"
          value={draft.startTime}
          disabled={isDisabled}
          error={errors.startTime}
          onChange={(value) => onFieldChange("startTime", value)}
          className="mt-3"
        />
      )}
      {canEditSpan && draft.repeatRule && (
        <DateField
          id="event-repeat-until"
          label="끝나는 날"
          hint="선택"
          min={getMinDateAfterStart(draft.date)}
          value={draft.repeatUntil}
          openDate={draft.date}
          isClearable
          isDisabled={isDisabled}
          error={errors.repeatUntil}
          onChange={(date) => onFieldChange("repeatUntil", date)}
          className="mt-3"
        />
      )}
    </div>
  );
};
