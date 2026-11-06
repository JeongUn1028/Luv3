"use client";

import Link from "next/link";
import { useState, type ReactElement } from "react";
import { AuthorTag } from "@/components/AuthorTag";
import { EventTimeLabel } from "@/components/events/EventTimeLabel";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/components/icons";
import { ANNIVERSARY_DATE, countDaysTogether, getAnniversaryLabel } from "@/lib/anniversary";
import {
  describeDayEvents,
  getDayHighlight,
  getDayNumberClassName,
  getHighlightClassNames,
  LEGEND_EVENT_KINDS,
} from "@/lib/calendar/highlight";
import {
  buildMonthGrid,
  canLeaveRecord,
  formatDayHeading,
  formatMonthTitle,
  getDefaultSelectedDate,
  groupByDate,
  shiftMonth,
  toCalendarHref,
} from "@/lib/calendar/month";
import { toNewRecordHref } from "@/lib/dates/form";
import type { CalendarEvent, CalendarRecord } from "@/lib/events/calendar";
import { formatRepeatRule, toEventEditHref } from "@/lib/events/recurrence";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

interface CalendarViewProps {
  /** 보고 있는 달 YYYY-MM */
  month: string;
  /** 오늘(한국 날짜) YYYY-MM-DD */
  today: string;
  /** 주소의 `date`(일정을 저장하고 돌아온 날). 보는 달의 날이면 처음에 고른다 */
  requestedDate?: string | string[];
  events: CalendarEvent[];
  records: CalendarRecord[];
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"] as const;

// 달 이동은 주소(`/calendar?month=`)로 한다. 캘린더 탭은 일정·기록만 불러오므로 앨범 그리드를 다시 불러오지 않는다(#41)
const monthHref = (month: string): string => toCalendarHref({ month });

const navButtonClassName = "flex size-11 items-center justify-center text-ink-sub hover:text-ink";

// 날짜 숫자 뒤에 손으로 그은 듯한 형광펜 띠. 숫자 원(size-7, 위 여백 pt-1.5)의 가운데 높이에 맞춘다
const highlightBandClassName =
  "absolute top-2.5 left-1/2 h-5 w-10 -translate-x-1/2 -rotate-2 rounded-[2px_7px_3px_8px/5px_3px_6px_3px]";

/** 공유 캘린더: 월 달력 + 고른 날의 데이트 기록·일정 */
export const CalendarView = ({ month, today, requestedDate, events, records }: CalendarViewProps): ReactElement => {
  // 달이나 주소의 날이 바뀌면 부모가 key로 새로 그리므로, 처음 고른 날만 정하면 된다
  const [selectedDate, setSelectedDate] = useState(() => getDefaultSelectedDate(month, today, requestedDate));
  const eventsByDate = groupByDate(events);
  const recordsByDate = groupByDate(records);
  const selectedEvents = eventsByDate.get(selectedDate) ?? [];
  const selectedRecords = recordsByDate.get(selectedDate) ?? [];
  const selectedAnniversary = getAnniversaryLabel(ANNIVERSARY_DATE, selectedDate);
  const isEmptyDay = !selectedAnniversary && selectedRecords.length === 0 && selectedEvents.length === 0;

  return (
    <div className="flex flex-col px-4 pb-6">
      <div className="flex items-center justify-between pt-2">
        <h2 aria-live="polite" className="px-0.5 font-display text-[20px] tracking-[3px] text-label">
          {formatMonthTitle(month)}
        </h2>
        <div className="-mr-3 flex items-center">
          {!today.startsWith(month) && (
            <Link href={monthHref(today.slice(0, 7))} scroll={false} className="h-11 px-2 text-[13px] leading-[44px] text-ink-sub hover:text-ink">
              오늘
            </Link>
          )}
          <Link href={monthHref(shiftMonth(month, -1))} scroll={false} aria-label="이전 달" className={navButtonClassName}>
            <ChevronLeftIcon className="size-5" />
          </Link>
          <Link href={monthHref(shiftMonth(month, 1))} scroll={false} aria-label="다음 달" className={navButtonClassName}>
            <ChevronRightIcon className="size-5" />
          </Link>
        </div>
      </div>

      <table className="mt-2 w-full table-fixed border-collapse">
        <thead>
          <tr>
            {WEEKDAYS.map((weekday) => (
              <th key={weekday} scope="col" className="h-8 text-[12px] font-normal text-ink-sub">
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
                const highlight = getDayHighlight(dayEvents);
                const highlightClassNames = highlight && getHighlightClassNames({ highlight, isCurrentMonth });
                const summary = [...describeDayEvents(dayEvents), recordCount > 0 && `기록 ${recordCount}개`].filter(Boolean);
                return (
                  <td key={date} className="p-0.5">
                    <button
                      type="button"
                      aria-pressed={isSelected}
                      aria-label={[formatDayHeading(date), isToday && "오늘", anniversary, ...summary].filter(Boolean).join(", ")}
                      onClick={() => setSelectedDate(date)}
                      className={`relative flex h-12 w-full flex-col items-center justify-start gap-1 rounded-[10px] pt-1.5 text-[14px] ${
                        isSelected ? "bg-surface" : ""
                      } ${isCurrentMonth ? "text-ink" : "text-ink-placeholder"}`}
                    >
                      {highlightClassNames && (
                        <span aria-hidden="true" className={`${highlightBandClassName} ${highlightClassNames.band}`} />
                      )}
                      <span
                        className={`relative flex size-7 items-center justify-center rounded-full ${getDayNumberClassName({
                          isToday,
                          isAnniversary: Boolean(anniversary),
                          isSelected,
                          highlightClassNames,
                        })}`}
                      >
                        {day}
                      </span>
                      <span aria-hidden="true" className="flex h-1.5 gap-1">
                        {recordCount > 0 && <span className="size-1.5 rounded-full bg-ink-sub" />}
                      </span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-ink-sub">
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="size-2 rounded-full ring-1 ring-highlight" />
          기념일
        </span>
        <span className="flex items-center gap-1">
          <span aria-hidden="true" className="size-1.5 rounded-full bg-ink-sub" />
          데이트 기록
        </span>
        {LEGEND_EVENT_KINDS.map(({ highlight, label }) => (
          <span key={highlight} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className={`h-2 w-3.5 -rotate-2 rounded-[2px] ${getHighlightClassNames({ highlight, isCurrentMonth: true }).band}`}
            />
            {label} 일정
          </span>
        ))}
      </p>

      <section aria-labelledby="selected-day" className="mt-4 flex flex-col">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <h3 id="selected-day" className="font-display text-[15px] text-ink">
              {formatDayHeading(selectedDate)}
            </h3>
            {selectedDate >= ANNIVERSARY_DATE && (
              <p className="text-[12px] text-ink-sub">함께한 지 {countDaysTogether(ANNIVERSARY_DATE, selectedDate)}일째</p>
            )}
          </div>
          <Link
            href={`/events/new?date=${selectedDate}`}
            transitionTypes={FORWARD_TRANSITION}
            // 머리글의 + (오늘 일정 추가)와 구별되게 고른 날을 이름에 넣는다
            aria-label={`${formatDayHeading(selectedDate)} 일정 추가`}
            className="-mr-2 flex h-11 items-center gap-1 px-2 text-[14px] text-ink-sub hover:text-ink"
          >
            <PlusIcon className="size-4" />
            일정 추가
          </Link>
        </div>
        {isEmptyDay ? (
          <p className="py-6 text-center text-[13px] text-ink-sub">이날은 아직 비어 있어요</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {selectedAnniversary && (
              <li className="flex min-h-[51px] items-center gap-3 rounded-[10px] border border-line px-4 py-2">
                <span className="w-11 shrink-0 text-[12px] text-highlight">기념일</span>
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{selectedAnniversary}</span>
              </li>
            )}
            {selectedRecords.map((record) => (
              <li key={record.id}>
                <Link
                  href={`/dates/${record.id}`}
                  transitionTypes={FORWARD_TRANSITION}
                  className="flex min-h-[51px] items-center gap-3 rounded-[10px] bg-surface px-4 py-2"
                >
                  <span className="w-11 shrink-0 text-[12px] text-label">기록</span>
                  <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{record.title}</span>
                  {record.authorNickname && <AuthorTag nickname={record.authorNickname} />}
                </Link>
              </li>
            ))}
            {selectedEvents.map((event) => (
              <li key={event.id} className="flex gap-2">
                <Link
                  href={toEventEditHref(event)}
                  transitionTypes={FORWARD_TRANSITION}
                  className="flex min-h-[51px] min-w-0 flex-1 items-center gap-3 rounded-[10px] bg-surface px-4 py-2"
                >
                  <EventTimeLabel event={event} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] text-ink">{event.title}</span>
                    {(event.repeatRule || event.place) && (
                      <span className="truncate text-[12px] text-ink-sub">
                        {[event.repeatRule && formatRepeatRule(event.repeatRule), event.place].filter(Boolean).join(" · ")}
                      </span>
                    )}
                  </span>
                  {event.authorNickname && <AuthorTag nickname={event.authorNickname} />}
                </Link>
                {/* 지난 일정(오늘 포함)은 그날의 데이트 기록으로 이어 쓸 수 있다. 이미 남긴 일정은 다시 권하지 않는다 */}
                {canLeaveRecord(event, today, selectedRecords) && (
                  <Link
                    href={toNewRecordHref({ date: event.date, title: event.title, place: event.place ?? "" })}
                    transitionTypes={FORWARD_TRANSITION}
                    aria-label={`${event.title} 기록 남기기`}
                    className="flex shrink-0 items-center rounded-[10px] border border-line px-3 text-[12px] text-ink-sub hover:text-ink"
                  >
                    기록 남기기
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
