"use client";

import type { ReactElement } from "react";
import { DateField } from "@/components/FormField";
import { getMinEndDate, type DraftErrors } from "@/lib/dates/form";

interface RecordDateFieldsProps {
  date: string;
  /** undefined면 하루 기록, 빈 문자열이면 기간을 켰지만 아직 고르지 않은 상태다 */
  endDate: string | undefined;
  /** 한국 날짜로 오늘. 앞날의 기록은 남기지 않는다 */
  today: string;
  errors: DraftErrors;
  isDisabled: boolean;
  onDateChange: (field: "date" | "endDate", value: string) => void;
  onPeriodChange: (isChecked: boolean) => void;
}

/**
 * 기록 날짜 칸: 날짜, "기간으로 남기기", 끝 날짜.
 *
 * @example <RecordDateFields date={draft.date} endDate={draft.endDate} today={today} errors={errors} isDisabled={isSaving} onDateChange={updateField} onPeriodChange={handlePeriodChange} />
 */
export const RecordDateFields = ({ date, endDate, today, errors, isDisabled, onDateChange, onPeriodChange }: RecordDateFieldsProps): ReactElement => {
  const isPeriod = endDate !== undefined;

  return (
    <div className="flex flex-col">
      <DateField
        id="date"
        label={isPeriod ? "시작 날짜" : "날짜"}
        max={today}
        value={date}
        isDisabled={isDisabled}
        error={errors.date}
        onChange={(value) => onDateChange("date", value)}
      />
      <label className="mt-1 flex h-11 w-fit items-center gap-2 text-[13px] text-ink-sub">
        <input
          type="checkbox"
          checked={isPeriod}
          disabled={isDisabled}
          onChange={(event) => onPeriodChange(event.target.checked)}
          className="size-4 accent-accent"
        />
        기간으로 남기기
      </label>
      {isPeriod && (
        <DateField
          id="endDate"
          label="끝 날짜"
          min={getMinEndDate(date, today)}
          max={today}
          value={endDate}
          openDate={date}
          isDisabled={isDisabled}
          error={errors.endDate}
          onChange={(value) => onDateChange("endDate", value)}
          className="mt-2"
        />
      )}
    </div>
  );
};
