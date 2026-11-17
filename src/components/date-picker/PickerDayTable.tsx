"use client";

import type { KeyboardEvent, ReactElement } from "react";
import { isSelectableDate, type DateBounds } from "@/lib/calendar/date-picker";
import { getDayTextClassName, getDayTone, getWeekdayClassName } from "@/lib/calendar/highlight";
import { formatDayHeading, WEEKDAYS, type CalendarDay } from "@/lib/calendar/month";
import type { HolidayNames } from "@/lib/holidays/holidays";

interface PickerDayTableProps {
  weeks: CalendarDay[][];
  /** 고른 날 YYYY-MM-DD. 비어 있으면 아직 고르지 않은 상태 */
  value: string;
  today: string;
  /** 키보드 초점을 받는 날. 달력 칸 중 이 칸만 Tab으로 들어온다 */
  focusDate: string | undefined;
  bounds: DateBounds;
  holidayNames: HolidayNames;
  onPick: (date: string) => void;
  onDayKeyDown: (event: KeyboardEvent<HTMLButtonElement>, date: string) => void;
}

/**
 * 날짜 선택 창의 일요일 시작 달력 표. 칸마다 누르면 그날을 고른다.
 *
 * @example <PickerDayTable weeks={weeks} value={value} today={today} focusDate={focusDate} bounds={bounds} holidayNames={names} onPick={pick} onDayKeyDown={move} />
 */
export const PickerDayTable = ({ weeks, value, today, focusDate, bounds, holidayNames, onPick, onDayKeyDown }: PickerDayTableProps): ReactElement => (
  <table className="mt-1 w-full table-fixed border-collapse">
    <thead>
      <tr>
        {WEEKDAYS.map((weekday, index) => (
          <th key={weekday} scope="col" className={`h-7 text-[12px] font-normal ${getWeekdayClassName(index)}`}>
            {weekday}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {weeks.map((week) => (
        <tr key={week[0]?.date}>
          {week.map(({ date, day, isCurrentMonth }) => {
            const isSelected = date === value;
            const isToday = date === today;
            const holidayName = holidayNames[date];
            const textClassName = getDayTextClassName(getDayTone(date, holidayName), isSelected ? "fill" : isCurrentMonth ? "plain" : "dim");
            return (
              <td key={date} className="p-0">
                <button
                  type="button"
                  data-date={date}
                  tabIndex={date === focusDate ? 0 : -1}
                  disabled={!isSelectableDate(date, bounds)}
                  aria-pressed={isSelected}
                  aria-current={isToday ? "date" : undefined}
                  // 해를 옮겨 다니는 창이라 칸마다 연도까지 읽는다
                  aria-label={[`${date.slice(0, 4)}년 ${formatDayHeading(date)}`, isToday && "오늘", holidayName].filter(Boolean).join(", ")}
                  onClick={() => onPick(date)}
                  onKeyDown={(event) => onDayKeyDown(event, date)}
                  className={`h-11 w-full rounded-[10px] text-[14px] disabled:opacity-30 ${textClassName} ${isSelected ? "bg-accent" : ""} ${
                    isToday && !isSelected ? "ring-1 ring-highlight ring-inset" : ""
                  }`}
                >
                  {day}
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
);
