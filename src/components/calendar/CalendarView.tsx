"use client";

import Link from "next/link";
import { useLayoutEffect, useState, useSyncExternalStore, type ReactElement } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { getHighlightClassNames, LEGEND_EVENT_KINDS } from "@/lib/calendar/highlight";
import { formatMonthTitle, getDefaultSelectedDate, groupByDate, shiftMonth, toCalendarHref } from "@/lib/calendar/month";
import type { CalendarEvent, CalendarRecord } from "@/lib/events/calendar";
import { DELETING_KEYS, isDeletingEvent, omitDeleting, useDeletingKeys } from "@/lib/deleting";
import { findSettledPendingEventIds, mergePendingEvents, pendingEventStore, type PendingEvent } from "@/lib/events/pending";
import { omitLinkedRecords } from "@/lib/events/record-link";
import type { HolidayNames } from "@/lib/holidays/holidays";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { MonthGrid } from "./MonthGrid";
import { SelectedDayList } from "./SelectedDayList";

interface CalendarViewProps {
  /** 보고 있는 달 YYYY-MM */
  month: string;
  /** 오늘(한국 날짜) YYYY-MM-DD */
  today: string;
  /** 주소의 `date`(일정을 저장하고 돌아온 날). 보는 달의 날이면 처음에 고른다 */
  requestedDate?: string | string[];
  events: CalendarEvent[];
  records: CalendarRecord[];
  /** 달력 칸 범위의 공휴일 이름. 받지 못했으면 비어 있다 */
  holidayNames: HolidayNames;
}

// 달 이동은 주소(`/calendar?month=`)로 한다. 캘린더 탭은 일정·기록만 불러오므로 앨범 그리드를 다시 불러오지 않는다(#41)
const monthHref = (month: string): string => toCalendarHref({ month });

const NO_PENDING_EVENTS: readonly PendingEvent[] = [];

const navButtonClassName = "press-icon flex size-11 items-center justify-center text-ink-sub hover:text-ink";

/**
 * 공유 캘린더: 월 달력 + 고른 날의 데이트 기록·일정.
 * 폼에서 저장 중인 하루짜리 일정(#345)은 서버 목록이 따라잡을 때까지 띠와 줄을 먼저 그리고, 줄은 흐리게 두어 누를 수 없게 한다.
 */
export const CalendarView = ({ month, today, requestedDate, events, records, holidayNames }: CalendarViewProps): ReactElement => {
  // 달이나 주소의 날이 바뀌면 부모가 key로 새로 그리므로, 처음 고른 날만 정하면 된다
  const [selectedDate, setSelectedDate] = useState(() => getDefaultSelectedDate(month, today, requestedDate));
  const pendingEvents = useSyncExternalStore(pendingEventStore.subscribe, pendingEventStore.getPending, () => NO_PENDING_EVENTS);
  // 서버 목록이 따라잡은 일정은 보관함에서 뺀다. 이미 서버 값으로 그리고 있어 화면은 바뀌지 않는다
  useLayoutEffect(() => {
    pendingEventStore.remove(findSettledPendingEventIds(events, pendingEvents));
  }, [events, pendingEvents]);
  // 저장은 끝났는데 목록에 들어오지 않은 일정(그사이 상대가 지움)이 흐린 채 남지 않게 한다
  useResetOnHide(() => pendingEventStore.removeSaved());
  // 지우기를 확인하고 돌아온 일정·기록은 응답을 기다리지 않고 숨긴다(#346)
  const deletingKeys = useDeletingKeys();
  const eventsByDate = groupByDate(mergePendingEvents(events, pendingEvents).filter((event) => !isDeletingEvent(deletingKeys, event)));
  // 일정에 이어진 기록은 일정 줄의 "기록 보기"로 열므로 기록 줄·점에서 뺀다(#228)
  const recordsByDate = new Map(
    Array.from(groupByDate(omitDeleting(records, deletingKeys, DELETING_KEYS.record)), ([date, dayRecords]) => [date, omitLinkedRecords(dayRecords, eventsByDate.get(date) ?? [])]),
  );

  return (
    <div className="flex flex-col px-4 pb-6">
      <div className="flex items-center justify-between pt-2">
        <h2 aria-live="polite" className="px-0.5 font-display text-[20px] tracking-[3px] text-label">
          {formatMonthTitle(month)}
        </h2>
        <div className="-mr-3 flex items-center">
          {!today.startsWith(month) && (
            <Link href={monthHref(today.slice(0, 7))} scroll={false} className="press-icon h-11 px-2 text-[13px] leading-[44px] text-ink-sub hover:text-ink">
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

      <MonthGrid
        month={month}
        today={today}
        selectedDate={selectedDate}
        eventsByDate={eventsByDate}
        recordsByDate={recordsByDate}
        holidayNames={holidayNames}
        onSelectDate={setSelectedDate}
      />
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

      <SelectedDayList
        selectedDate={selectedDate}
        today={today}
        holidayNames={holidayNames}
        records={recordsByDate.get(selectedDate) ?? []}
        events={eventsByDate.get(selectedDate) ?? []}
      />
    </div>
  );
};
