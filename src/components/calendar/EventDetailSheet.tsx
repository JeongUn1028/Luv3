"use client";

import Link from "next/link";
import type { ReactElement, ReactNode, Ref } from "react";
import { EventOwnerTag } from "@/components/AuthorTag";
import { EventRecordAction } from "@/components/events/EventRecordAction";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { formatDayHeading, formatEventTime } from "@/lib/calendar/month";
import type { CalendarEvent } from "@/lib/events/calendar";
import type { EventRecordLink } from "@/lib/events/record-link";
import { formatEventPeriod, formatRepeatRule, toEventEditHref } from "@/lib/events/recurrence";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { requestTodoFocus } from "@/lib/todos/focus";
import { TODOS_PATH } from "@/lib/todos/list";

interface EventDetailSheetProps {
  ref: Ref<ModalDialogHandle>;
  /** 마지막으로 연 일정. 닫히는 동안에도 내용을 그대로 그린다 */
  event: CalendarEvent | undefined;
  /** 지난 함께 일정이면 기록 남기기·보기(#227) */
  recordLink: EventRecordLink | undefined;
  /** 고치기·하고 싶은 것으로 떠나기 전에 창을 닫는다. 돌아왔을 때 창이 열려 있지 않게 한다 */
  onLeave: () => void;
}

const ACTION_CLASS_NAME = "press-card flex h-12 flex-1 items-center justify-center rounded-[10px] text-[15px]";

// 이름 칸은 가장 긴 이름("하고 싶은 것")에 맞춰 줄마다 같은 너비로 둔다(목록이 칸 나누기 틀, 줄은 그 안에 녹인다)
const DetailRow = ({ label, children }: { label: string; children: ReactNode }): ReactElement => (
  <div className="contents">
    <dt className="min-w-12 text-ink-sub">{label}</dt>
    <dd className="min-w-0 break-words">{children}</dd>
  </div>
);

/**
 * 캘린더에서 일정을 누르면 아래에서 올라오는 읽기 창(#352). 언제·반복·기간·장소·이어진 하고 싶은 것(#471)·쓴 사람·메모를 보여 주고,
 * 고칠 때만 "고치기"로 고치기 화면을 연다. 지난 함께 일정이면 기록 남기기·보기도 둔다.
 *
 * @example <EventDetailSheet ref={sheetRef} event={openedEvent} recordLink={recordLink} onLeave={() => sheetRef.current?.closeImmediately()} />
 */
export const EventDetailSheet = ({ ref, event, recordLink, onLeave }: EventDetailSheetProps): ReactElement => (
  <ModalDialog
    ref={ref}
    title={event?.title ?? ""}
    isBottomSheet
    shouldCloseOnOutsideClick
    titleAccessory={event && <EventOwnerTag isTogether={event.isTogether} authorNickname={event.authorNickname} />}
  >
    {event && (
      <div className="flex flex-col gap-4 pt-1">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 text-[14px]">
          <DetailRow label="언제">
            {formatDayHeading(event.date)} {formatEventTime(event.startTime)}
          </DetailRow>
          {event.period && <DetailRow label="기간">{formatEventPeriod(event.period)}</DetailRow>}
          {event.repeatRule && <DetailRow label="반복">{formatRepeatRule(event.repeatRule)}</DetailRow>}
          {event.place && <DetailRow label="장소">{event.place}</DetailRow>}
          {event.todo && (
            <DetailRow label="하고 싶은 것">
              <Link
                href={TODOS_PATH}
                transitionTypes={FORWARD_TRANSITION}
                onClick={() => {
                  if (event.todo) requestTodoFocus(event.todo.id);
                  onLeave();
                }}
                className="text-accent underline underline-offset-[3px]"
              >
                {event.todo.content}
              </Link>
            </DetailRow>
          )}
        </dl>
        {/* 메모는 쓴 그대로(줄바꿈 포함) 보여 준다. 띄어쓰기 없이 긴 주소도 칸 안에서 나눈다 */}
        {event.memo && <p className="rounded-[10px] bg-background/60 px-3 py-2.5 text-[14px] leading-[1.6] break-words whitespace-pre-wrap">{event.memo}</p>}
        <div className="flex gap-2">
          {recordLink && <EventRecordAction eventId={event.id} link={recordLink} className={`${ACTION_CLASS_NAME} border border-line text-ink`} />}
          <Link href={toEventEditHref(event)} transitionTypes={FORWARD_TRANSITION} onClick={onLeave} className={`${ACTION_CLASS_NAME} bg-accent font-display text-background`}>
            고치기
          </Link>
        </div>
      </div>
    )}
  </ModalDialog>
);
