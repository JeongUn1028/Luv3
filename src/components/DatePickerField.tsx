"use client";

import { useRef, useState, type KeyboardEvent, type MouseEvent, type ReactElement } from "react";
import { flushSync } from "react-dom";
import { PickerDayTable } from "@/components/date-picker/PickerDayTable";
import { PickerMonthNav } from "@/components/date-picker/PickerMonthNav";
import { useGridHolidayNames } from "@/components/date-picker/use-grid-holiday-names";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { toKstDate } from "@/lib/anniversary";
import { getFocusDate, getInitialMonth, getKeyboardDayOffset, isSelectableDate } from "@/lib/calendar/date-picker";
import { addDays, buildMonthGrid } from "@/lib/calendar/month";
import { formatRecordDate } from "@/lib/dates/record-date-format";
import { isIsoDate } from "@/lib/form";

interface DatePickerFieldProps {
  id: string;
  /** 칸 이름. 화면 읽기가 지금 값과 함께 읽는다 */
  label: string;
  /** YYYY-MM-DD. 비어 있으면 아직 고르지 않은 상태 */
  value: string;
  /** 값이 없을 때 창을 열 날. 끝 날짜는 시작 날짜 근처를 고르는 일이 많다 */
  openDate?: string | undefined;
  min?: string | undefined;
  max?: string | undefined;
  isDisabled?: boolean;
  isInvalid?: boolean;
  describedBy?: string | undefined;
  /** 비워 둘 수 있는 칸이면 창에 "지우기"를 둔다 */
  isClearable?: boolean;
  onChange: (value: string) => void;
  /** 칸의 모양. 폼의 다른 입력 칸과 같은 클래스를 받는다 */
  className: string;
}

/** 창을 연 동안의 화면 상태 */
interface PickerView {
  month: string;
  today: string;
  /** 키보드 초점을 받는 날. 달력 칸 중 이 칸만 Tab으로 들어온다 */
  focusDate: string | undefined;
}

/**
 * 날짜 입력 칸과 날짜 선택 창. `input type="date"`는 아이폰이 창을 그려 시작 요일을 정할 수 없어
 * 캘린더 탭과 같은 일요일 시작 달력을 앱에서 직접 그린다(#178).
 */
export const DatePickerField = ({
  id,
  label,
  value,
  openDate,
  min,
  max,
  isDisabled = false,
  isInvalid = false,
  describedBy,
  isClearable = false,
  onChange,
  className,
}: DatePickerFieldProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<PickerView>();
  const weeks = view && buildMonthGrid(view.month);
  const holidayNames = useGridHolidayNames(weeks);

  const bounds = { min, max };
  const hasValue = isIsoDate(value);
  const shownValue = hasValue ? formatRecordDate(value) : "날짜 선택";
  const anchor = hasValue ? value : (openDate ?? "");

  const focusDay = (date: string | undefined) => {
    calendarRef.current?.querySelector<HTMLButtonElement>(`[data-date="${date}"]`)?.focus();
  };

  const closeDialog = () => modalRef.current?.close();

  const handleOpen = (event: MouseEvent<HTMLButtonElement>) => {
    // 아이폰 Safari는 버튼을 눌러도 초점을 주지 않는다. 그대로 열면 닫을 때 앞서 쓰던 칸으로 초점이 돌아가 키보드가 다시 올라온다
    event.currentTarget.focus();
    const today = toKstDate(new Date());
    const month = getInitialMonth(anchor, today, bounds);
    const focusDate = getFocusDate({ month, value: anchor, today, bounds });
    // 닫혀 있는 동안에는 달력을 그리지 않으므로, 초점을 옮기기 전에 먼저 그린다
    flushSync(() => setView({ month, today, focusDate }));
    modalRef.current?.open();
    focusDay(focusDate);
  };

  const handleChange = (date: string) => {
    onChange(date);
    closeDialog();
  };

  const handleDayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, date: string) => {
    const offset = getKeyboardDayOffset(event.key);
    if (offset === undefined || !view) return;
    event.preventDefault();
    const nextDate = addDays(date, offset);
    if (!isSelectableDate(nextDate, bounds)) return;
    flushSync(() => setView({ ...view, month: nextDate.slice(0, 7), focusDate: nextDate }));
    focusDay(nextDate);
  };

  const handleShowMonth = (event: MouseEvent<HTMLButtonElement>, month: string) => {
    if (!view) return;
    const focusDate = getFocusDate({ month, value: anchor, today: view.today, bounds });
    flushSync(() => setView({ ...view, month, focusDate }));
    // 범위 끝에 닿아 누른 버튼이 막히면 초점이 사라지므로 달력으로 옮긴다
    if (event.currentTarget.disabled) focusDay(focusDate);
  };

  return (
    <>
      <button
        type="button"
        id={id}
        disabled={isDisabled}
        aria-label={`${label} ${hasValue ? shownValue : "선택 안 함"}`}
        aria-haspopup="dialog"
        // 버튼에는 aria-invalid를 쓸 수 없어 오류는 aria-describedby의 문구로 전하고, 테두리만 data로 칠한다
        data-invalid={isInvalid}
        aria-describedby={describedBy}
        onClick={handleOpen}
        className={`${className} text-left text-[16px] disabled:opacity-50 data-[invalid=true]:border-accent`}
      >
        <span className={hasValue ? undefined : "text-ink-placeholder"}>{shownValue}</span>
      </button>
      <ModalDialog ref={modalRef} title={`${label} 고르기`} onClose={() => setView(undefined)} shouldCloseOnOutsideClick shouldGuardDoubleTap>
        {view && (
          <div ref={calendarRef} className="mt-2 flex flex-col">
            <PickerMonthNav month={view.month} bounds={bounds} onShowMonth={handleShowMonth} />
            <PickerDayTable
              weeks={weeks ?? []}
              value={value}
              today={view.today}
              focusDate={view.focusDate}
              bounds={bounds}
              holidayNames={holidayNames}
              onPick={handleChange}
              onDayKeyDown={handleDayKeyDown}
            />
            <div className="mt-1 flex justify-end">
              {isClearable && hasValue && (
                <button type="button" onClick={() => handleChange("")} className="press-icon mr-auto h-11 px-2 text-[14px] text-ink-sub hover:text-ink">
                  지우기
                </button>
              )}
              <button type="button" onClick={closeDialog} className="press-icon h-11 px-2 text-[14px] text-ink-sub hover:text-ink">
                닫기
              </button>
            </div>
          </div>
        )}
      </ModalDialog>
    </>
  );
};
