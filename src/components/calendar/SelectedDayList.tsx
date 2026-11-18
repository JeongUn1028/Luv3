"use client";

import Link from "next/link";
import { useRef, useState, type ReactElement } from "react";
import { AuthorTag, EventOwnerTag } from "@/components/AuthorTag";
import { EventRecordAction } from "@/components/events/EventRecordAction";
import { PlusIcon } from "@/components/icons";
import type { ModalDialogHandle } from "@/components/ModalDialog";
import { RetryButton } from "@/components/RetryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { SETTLE_TRANSITION_CLASS_NAME } from "@/components/settle-transition";
import { ANNIVERSARY_DATE, countDaysTogether, getAnniversaryLabel } from "@/lib/anniversary";
import { formatDayHeading, formatEventTime } from "@/lib/calendar/month";
import type { CalendarRecord } from "@/lib/events/calendar";
import { EVENT_LOAD_ERROR_MESSAGE } from "@/lib/events/load-error";
import type { ShownEvent } from "@/lib/events/pending";
import { getEventRecordLink } from "@/lib/events/record-link";
import { formatEventPeriod, formatRepeatRule } from "@/lib/events/recurrence";
import type { HolidayNames } from "@/lib/holidays/holidays";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { EventDetailSheet } from "./EventDetailSheet";

interface SelectedDayListProps {
  selectedDate: string;
  /** 오늘(한국 날짜). 지난 함께 일정에만 "기록 남기기"를 둔다 */
  today: string;
  holidayNames: HolidayNames;
  records: readonly CalendarRecord[];
  events: readonly ShownEvent[];
  /** 넘긴 달의 일정을 받는 중이거나 받지 못했는지(#348). 받은 달이면 생략한다 */
  monthStatus?: "loading" | "failed";
  /** 받지 못한 달을 다시 받는다 */
  onRetryMonth?: () => void;
}

const MonthLoading = (): ReactElement => (
  <div className="mt-2 flex flex-col gap-2">
    <p role="status" className="sr-only">
      일정을 받는 중이에요
    </p>
    <SkeletonBlock className="h-[51px] rounded-[10px]" />
    <SkeletonBlock className="h-[51px] rounded-[10px]" />
  </div>
);

const MonthLoadFailed = ({ onRetry }: { onRetry: () => void }): ReactElement => (
  <div className="flex flex-col items-center gap-3 py-6 text-center">
    <p role="alert" className="text-[13px] break-keep text-balance text-ink-sub">
      {EVENT_LOAD_ERROR_MESSAGE}
    </p>
    <div className="flex w-full max-w-60 flex-col">
      <RetryButton isPending={false} onRetry={onRetry} />
    </div>
  </div>
);

/**
 * 캘린더에서 고른 날: 날짜 머리글과 "일정 추가", 그날의 기념일·공휴일·기록·일정 줄.
 * 일정 줄을 누르면 아래에서 읽기 창을 연다(#352). 폼에서 저장 중인 일정(#345)은 흐리게 두어 누를 수 없게 한다.
 *
 * @example <SelectedDayList selectedDate="2026-11-16" today="2026-11-16" holidayNames={holidayNames} records={records} events={events} />
 */
export const SelectedDayList = ({
  selectedDate,
  today,
  holidayNames,
  records,
  events,
  monthStatus,
  onRetryMonth = () => undefined,
}: SelectedDayListProps): ReactElement => {
  const anniversary = getAnniversaryLabel(ANNIVERSARY_DATE, selectedDate);
  const holiday = holidayNames[selectedDate];
  const isEmptyDay = !anniversary && !holiday && records.length === 0 && events.length === 0;
  const sheetRef = useRef<ModalDialogHandle>(null);
  // 닫히는 동안에도 내용을 그리도록 마지막으로 연 일정을 남긴다. 열린 동안 목록이 새로 오면(고친 뒤 등) 새 내용을 보여 준다
  const [lastOpenedEvent, setOpenedEvent] = useState<ShownEvent | undefined>(undefined);
  const openedEvent = lastOpenedEvent && (events.find(({ id, date }) => id === lastOpenedEvent.id && date === lastOpenedEvent.date) ?? lastOpenedEvent);
  const openEvent = (event: ShownEvent) => {
    setOpenedEvent(event);
    sheetRef.current?.open();
  };

  return (
    <section aria-labelledby="selected-day" className="mt-4 flex flex-col">
      <div className="flex items-center justify-between">
        <div className="flex flex-col">
          <h3 id="selected-day" className="font-display text-[15px] text-ink">
            {formatDayHeading(selectedDate)}
          </h3>
          {selectedDate >= ANNIVERSARY_DATE && <p className="text-[12px] text-ink-sub">함께한 지 {countDaysTogether(ANNIVERSARY_DATE, selectedDate)}일째</p>}
        </div>
        <Link
          href={`/events/new?date=${selectedDate}`}
          transitionTypes={FORWARD_TRANSITION}
          // 머리글의 + (오늘 일정 추가)와 구별되게 고른 날을 이름에 넣는다
          aria-label={`${formatDayHeading(selectedDate)} 일정 추가`}
          className="press-icon -mr-2 flex h-11 items-center gap-1 px-2 text-[14px] text-ink-sub hover:text-ink"
        >
          <PlusIcon className="size-4" />
          일정 추가
        </Link>
      </div>
      {monthStatus === "loading" ? (
        <MonthLoading />
      ) : monthStatus === "failed" ? (
        <MonthLoadFailed onRetry={onRetryMonth} />
      ) : isEmptyDay ? (
        <p className="py-6 text-center text-[13px] text-ink-sub">이날은 아직 비어 있어요</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {anniversary && (
            <li className="flex min-h-[51px] items-center gap-3 rounded-[10px] border border-line px-4 py-2">
              <span className="w-11 shrink-0 text-[12px] text-highlight">기념일</span>
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{anniversary}</span>
            </li>
          )}
          {/* 빨간 날짜가 왜 빨간지 색만으로는 알 수 없어 이름을 적는다(#200) */}
          {holiday && (
            <li className="flex min-h-[51px] items-center gap-3 rounded-[10px] border border-line px-4 py-2">
              <span className="w-11 shrink-0 text-[12px] text-holiday">공휴일</span>
              <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{holiday}</span>
            </li>
          )}
          {records.map((record) => (
            <li key={record.id}>
              <Link
                href={`/dates/${record.id}`}
                transitionTypes={FORWARD_TRANSITION}
                className="press-card flex min-h-[51px] items-center gap-3 rounded-[10px] bg-surface px-4 py-2"
              >
                <span className="w-11 shrink-0 text-[12px] text-label">기록</span>
                <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{record.title}</span>
                {record.authorNickname && <AuthorTag nickname={record.authorNickname} />}
              </Link>
            </li>
          ))}
          {events.map((event) => {
            const { isPending = false } = event;
            const recordLink = isPending ? undefined : getEventRecordLink(event, today);
            return (
              <li key={event.id} className="flex gap-2">
                {/* 저장 중인 일정은 아직 서버에 없을 수 있어 열지 않는다 */}
                <button
                  type="button"
                  aria-disabled={isPending}
                  aria-haspopup="dialog"
                  onClick={isPending ? undefined : () => openEvent(event)}
                  className="press-card flex min-h-[51px] min-w-0 flex-1 items-center gap-3 rounded-[10px] bg-surface px-4 py-2 text-left"
                >
                  <span className="w-11 shrink-0 text-[12px] text-ink-sub">{formatEventTime(event.startTime)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className={`truncate text-[15px] ${isPending ? "text-ink-sub" : "text-ink"} ${SETTLE_TRANSITION_CLASS_NAME}`}>
                      {event.title}
                      {isPending && <span className="sr-only"> (저장 중)</span>}
                    </span>
                    {(event.repeatRule || event.period || event.place) && (
                      <span className="truncate text-[12px] text-ink-sub">
                        {[event.repeatRule && formatRepeatRule(event.repeatRule), event.period && formatEventPeriod(event.period), event.place]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </span>
                  <EventOwnerTag isTogether={event.isTogether} authorNickname={event.authorNickname} />
                </button>
                {/* 지난 함께 일정(오늘 포함)은 데이트 기록으로 이어 쓸 수 있고, 이미 남긴 일정은 그 기록을 연다(#227) */}
                {recordLink && (
                  <EventRecordAction
                    eventId={event.id}
                    link={recordLink}
                    eventTitle={event.title}
                    className="press-icon flex shrink-0 items-center rounded-[10px] border border-line px-3 text-[12px] text-ink-sub hover:text-ink"
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <EventDetailSheet
        ref={sheetRef}
        event={openedEvent}
        recordLink={openedEvent && getEventRecordLink(openedEvent, today)}
        onLeave={() => sheetRef.current?.closeImmediately()}
      />
    </section>
  );
};
