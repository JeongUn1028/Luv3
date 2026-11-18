"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useState, useSyncExternalStore, type MouseEvent, type ReactElement } from "react";
import { useGridHolidayNames } from "@/components/date-picker/use-grid-holiday-names";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import { getHighlightClassNames, LEGEND_EVENT_KINDS } from "@/lib/calendar/highlight";
import { loadCalendarMonth } from "@/lib/calendar/load-month";
import { buildMonthGrid, formatMonthTitle, getDefaultSelectedDate, groupByDate, parseMonth, shiftMonth, toCalendarHref } from "@/lib/calendar/month";
import { createMonthCache, getAdjacentMonths, type MonthCache, type MonthState } from "@/lib/calendar/month-cache";
import type { CalendarEvent, CalendarRecord } from "@/lib/events/calendar";
import { DELETING_KEYS, isDeletingEvent, omitDeleting, useDeletingKeys } from "@/lib/deleting";
import { findSettledPendingEventIds, mergePendingEvents, pendingEventStore, type PendingEvent } from "@/lib/events/pending";
import { omitLinkedRecords } from "@/lib/events/record-link";
import type { HolidayNames } from "@/lib/holidays/holidays";
import { replaceScreenAddress } from "@/lib/navigation/screen-freshness";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { MonthGrid } from "./MonthGrid";
import { SelectedDayList } from "./SelectedDayList";

interface CalendarViewProps {
  /** 서버가 그린 달 YYYY-MM. 넘긴 달은 주소에서 읽는다 */
  month: string;
  /** 오늘(한국 날짜) YYYY-MM-DD */
  today: string;
  /** 주소의 `date`(일정을 저장하고 돌아온 날). 보는 달의 날이면 처음에 고른다 */
  requestedDate?: string | string[];
  events: CalendarEvent[];
  records: CalendarRecord[];
  /** 서버가 그린 달의 달력 칸 범위 공휴일 이름. 받지 못했으면 비어 있다 */
  holidayNames: HolidayNames;
}

// 넘긴 달도 주소(`/calendar?month=`)에 남겨, 다른 화면에 다녀오거나 새로 받아도 그 달을 보여 준다
const monthHref = (month: string): string => toCalendarHref({ month });

// 새 탭으로 열기처럼 브라우저가 따로 처리하는 누름은 링크에 맡긴다
const isPlainClick = (event: MouseEvent<HTMLAnchorElement>): boolean =>
  event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey;

/** 달별 일정 기억과, 그 기억을 만든 서버 목록 */
interface MonthCacheSource {
  events: CalendarEvent[];
  records: CalendarRecord[];
  cache: MonthCache;
}

const createMonthCacheSource = (month: string, events: CalendarEvent[], records: CalendarRecord[]): MonthCacheSource => ({
  events,
  records,
  cache: createMonthCache({ load: loadCalendarMonth, initial: { month, data: { events, records } } }),
});

/** 고른 날 목록에 보일 받는 상태. 받은 달이면 `undefined` */
const toListStatus = (state: MonthState | undefined): "loading" | "failed" | undefined => {
  if (state?.status === "loaded") return undefined;
  return state?.status === "failed" ? "failed" : "loading";
};

const NO_PENDING_EVENTS: readonly PendingEvent[] = [];

const navButtonClassName = "press-icon flex size-11 items-center justify-center text-ink-sub hover:text-ink";

/**
 * 공유 캘린더: 월 달력 + 고른 날의 데이트 기록·일정.
 * 폼에서 저장 중인 하루짜리 일정(#345)은 서버 목록이 따라잡을 때까지 띠와 줄을 먼저 그리고, 줄은 흐리게 두어 누를 수 없게 한다.
 * 달을 넘기면 화면을 서버에 다시 묻지 않고 달력 칸부터 그린 뒤 그 달 일정만 받아 채우고, 앞뒤 달은 미리 받아 둔다(#348).
 */
export const CalendarView = ({ month, today, requestedDate, events, records, holidayNames }: CalendarViewProps): ReactElement => {
  const shownMonth = parseMonth(useSearchParams().get("month") ?? undefined, today);
  // 서버에서 새로 받으면(저장·지우기 뒤 등) 넘겨 본 달도 옛 내용이므로 기억을 새로 만든다
  const [cacheSource, setCacheSource] = useState(() => createMonthCacheSource(month, events, records));
  let { cache } = cacheSource;
  if (cacheSource.events !== events || cacheSource.records !== records) {
    const nextSource = createMonthCacheSource(month, events, records);
    setCacheSource(nextSource);
    cache = nextSource.cache;
  }
  const getMonthState = () => cache.get(shownMonth);
  const monthState = useSyncExternalStore(cache.subscribe, getMonthState, getMonthState);
  const shownData = monthState?.status === "loaded" ? monthState.data : undefined;
  // 넘긴 달의 일정은 Supabase(외부 시스템)에서 받는다. 다른 화면에 다녀와 주소의 달로 다시 그려도 받는다
  useEffect(() => {
    cache.load(shownMonth);
  }, [cache, shownMonth]);
  // 보는 달을 다 받은 뒤 앞뒤 달을 받아, 넘길 때 기다리지 않게 한다
  const isShownLoaded = shownData !== undefined;
  useEffect(() => {
    if (isShownLoaded) getAdjacentMonths(shownMonth).forEach(cache.load);
  }, [cache, shownMonth, isShownLoaded]);
  // 서버가 그린 달의 공휴일은 함께 받았다. 넘긴 달은 해마다 한 번 받아 둔 이름을 쓴다(#438)
  const gridHolidayNames = useGridHolidayNames(shownMonth === month ? undefined : buildMonthGrid(shownMonth));
  const shownHolidayNames = { ...holidayNames, ...gridHolidayNames };

  // 고른 날은 그 달에서만 쓴다. 다른 화면에 다녀와 주소의 달만 바뀌었으면 그 달의 처음 고를 날을 보여 준다
  const [selection, setSelection] = useState(() => ({ month, date: getDefaultSelectedDate(month, today, requestedDate) }));
  const selectedDate = selection.month === shownMonth ? selection.date : getDefaultSelectedDate(shownMonth, today);
  const handleSelectDate = (date: string) => setSelection({ month: shownMonth, date });
  const handleMonthClick = (event: MouseEvent<HTMLAnchorElement>, nextMonth: string) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    // 넘긴 달에서는 처음 고를 날(오늘이 있으면 오늘)부터 보여 준다
    setSelection({ month: nextMonth, date: getDefaultSelectedDate(nextMonth, today) });
    replaceScreenAddress(monthHref(nextMonth));
  };

  const shownEvents = shownData?.events ?? [];
  const shownRecords = shownData?.records ?? [];
  const pendingEvents = useSyncExternalStore(pendingEventStore.subscribe, pendingEventStore.getPending, () => NO_PENDING_EVENTS);
  // 서버 목록이 따라잡은 일정은 보관함에서 뺀다. 이미 서버 값으로 그리고 있어 화면은 바뀌지 않는다
  useLayoutEffect(() => {
    if (shownData) pendingEventStore.remove(findSettledPendingEventIds(shownData.events, pendingEvents));
  }, [shownData, pendingEvents]);
  // 저장은 끝났는데 목록에 들어오지 않은 일정(그사이 상대가 지움)이 흐린 채 남지 않게 한다
  useResetOnHide(() => pendingEventStore.removeSaved());
  // 지우기를 확인하고 돌아온 일정·기록은 응답을 기다리지 않고 숨긴다(#346)
  const deletingKeys = useDeletingKeys();
  const eventsByDate = groupByDate(mergePendingEvents(shownEvents, pendingEvents).filter((event) => !isDeletingEvent(deletingKeys, event)));
  // 일정에 이어진 기록은 일정 줄의 "기록 보기"로 열므로 기록 줄·점에서 뺀다(#228)
  const recordsByDate = new Map(
    Array.from(groupByDate(omitDeleting(shownRecords, deletingKeys, DELETING_KEYS.record)), ([date, dayRecords]) => [
      date,
      omitLinkedRecords(dayRecords, eventsByDate.get(date) ?? []),
    ]),
  );
  const todayMonth = today.slice(0, 7);
  const previousMonth = shiftMonth(shownMonth, -1);
  const nextMonth = shiftMonth(shownMonth, 1);

  return (
    <div className="flex flex-col px-4 pb-6">
      <div className="flex items-center justify-between pt-2">
        <h2 aria-live="polite" className="px-0.5 font-display text-[20px] tracking-[3px] text-label">
          {formatMonthTitle(shownMonth)}
        </h2>
        <div className="-mr-3 flex items-center">
          {shownMonth !== todayMonth && (
            <Link
              href={monthHref(todayMonth)}
              scroll={false}
              onClick={(event) => handleMonthClick(event, todayMonth)}
              className="press-icon h-11 px-2 text-[13px] leading-[44px] text-ink-sub hover:text-ink"
            >
              오늘
            </Link>
          )}
          <Link
            href={monthHref(previousMonth)}
            scroll={false}
            onClick={(event) => handleMonthClick(event, previousMonth)}
            aria-label="이전 달"
            className={navButtonClassName}
          >
            <ChevronLeftIcon className="size-5" />
          </Link>
          <Link
            href={monthHref(nextMonth)}
            scroll={false}
            onClick={(event) => handleMonthClick(event, nextMonth)}
            aria-label="다음 달"
            className={navButtonClassName}
          >
            <ChevronRightIcon className="size-5" />
          </Link>
        </div>
      </div>

      <MonthGrid
        month={shownMonth}
        today={today}
        selectedDate={selectedDate}
        eventsByDate={eventsByDate}
        recordsByDate={recordsByDate}
        holidayNames={shownHolidayNames}
        onSelectDate={handleSelectDate}
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
        holidayNames={shownHolidayNames}
        records={recordsByDate.get(selectedDate) ?? []}
        events={eventsByDate.get(selectedDate) ?? []}
        monthStatus={toListStatus(monthState)}
        onRetryMonth={() => cache.load(shownMonth)}
      />
    </div>
  );
};
