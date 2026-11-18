"use client";

import type { ReactElement } from "react";
import { ANNIVERSARY_DATE, getAnniversaryLabel } from "@/lib/anniversary";
import {
  describeDayEvents,
  getDayHighlight,
  getDayNumberClassName,
  getDayTone,
  getHighlightClassNames,
  getWeekdayClassName,
  SELECTED_DAY_CELL_CLASS_NAME,
} from "@/lib/calendar/highlight";
import { buildMonthGrid, formatDayHeading, WEEKDAYS } from "@/lib/calendar/month";
import type { CalendarRecord } from "@/lib/events/calendar";
import type { ShownEvent } from "@/lib/events/pending";
import type { HolidayNames } from "@/lib/holidays/holidays";

// 날짜 숫자 뒤에 손으로 그은 듯한 형광펜 띠. 숫자 원(size-7, 위 여백 pt-1.5)의 가운데 높이에 맞춘다
const HIGHLIGHT_BAND_CLASS_NAME =
  "absolute top-2.5 left-1/2 h-5 w-10 -translate-x-1/2 -rotate-2 rounded-[2px_7px_3px_8px/5px_3px_6px_3px]";

interface MonthGridProps {
  /** 보고 있는 달 YYYY-MM */
  month: string;
  /** 오늘(한국 날짜) YYYY-MM-DD */
  today: string;
  selectedDate: string;
  /** 날짜별 일정(저장 중인 일정 포함, 지우는 중인 일정 뺌) */
  eventsByDate: ReadonlyMap<string, ShownEvent[]>;
  /** 날짜별 기록(일정에 이어진 기록 뺌). 날짜 버튼 이름의 "기록 N개"에 쓴다 */
  recordsByDate: ReadonlyMap<string, CalendarRecord[]>;
  /**
   * 기록이 하나라도 있는 날(일정에 이어진 기록 포함, 지우는 중인 기록 뺌). 분홍 띠에 쓴다(#461).
   * 이어진 일정을 나중에 한 사람 일정으로 바꿔도 기록이 있는 날은 분홍이어야 해서, 이어진 기록을 빼기 전 값을 받는다.
   */
  recordedDates: ReadonlySet<string>;
  holidayNames: HolidayNames;
  onSelectDate: (date: string) => void;
}

/**
 * 월 달력 표. 날마다 일정·기록 형광펜 띠, 기념일·공휴일·오늘 표시를 그리고 누르면 그날을 고른다.
 *
 * @example <MonthGrid month="2026-11" today="2026-11-16" selectedDate={selectedDate} eventsByDate={eventsByDate} recordsByDate={recordsByDate} recordedDates={recordedDates} holidayNames={holidayNames} onSelectDate={setSelectedDate} />
 */
export const MonthGrid = ({ month, today, selectedDate, eventsByDate, recordsByDate, recordedDates, holidayNames, onSelectDate }: MonthGridProps): ReactElement => (
  <table className="mt-2 w-full table-fixed border-collapse">
    <thead>
      <tr>
        {WEEKDAYS.map((weekday, index) => (
          <th key={weekday} scope="col" className={`h-8 text-[12px] font-normal ${getWeekdayClassName(index)}`}>
            {weekday}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {buildMonthGrid(month).map((week) => (
        <tr key={week[0]?.date}>
          {week.map(({ date, day, isCurrentMonth }) => {
            const dayEvents = eventsByDate.get(date) ?? [];
            const recordCount = recordsByDate.get(date)?.length ?? 0;
            const isSelected = date === selectedDate;
            const isToday = date === today;
            const anniversary = getAnniversaryLabel(ANNIVERSARY_DATE, date);
            const holidayName = holidayNames[date];
            const highlight = getDayHighlight({ events: dayEvents, hasRecord: recordedDates.has(date) });
            const highlightClassNames = highlight && getHighlightClassNames({ highlight, isCurrentMonth });
            const summary = [...describeDayEvents(dayEvents), recordCount > 0 && `기록 ${recordCount}개`].filter(Boolean);
            return (
              <td key={date} className="p-0.5">
                <button
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={[formatDayHeading(date), isToday && "오늘", anniversary, holidayName, ...summary].filter(Boolean).join(", ")}
                  onClick={() => onSelectDate(date)}
                  className={`relative flex h-12 w-full flex-col items-center justify-start gap-1 rounded-[10px] pt-1.5 text-[14px] ${
                    isSelected ? SELECTED_DAY_CELL_CLASS_NAME : ""
                  } ${isCurrentMonth ? "text-ink" : "text-ink-placeholder"}`}
                >
                  {highlightClassNames && <span aria-hidden="true" className={`calendar-mark-in ${HIGHLIGHT_BAND_CLASS_NAME} ${highlightClassNames.band}`} />}
                  <span
                    className={`relative flex size-7 items-center justify-center rounded-full ${getDayNumberClassName({
                      isToday,
                      isAnniversary: Boolean(anniversary),
                      isSelected,
                      highlightClassNames,
                      isCurrentMonth,
                      tone: getDayTone(date, holidayName),
                    })}`}
                  >
                    {day}
                  </span>
                </button>
              </td>
            );
          })}
        </tr>
      ))}
    </tbody>
  </table>
);
