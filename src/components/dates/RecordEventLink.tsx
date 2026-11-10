"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ReactElement } from "react";
import { ModalActions, ModalDialog, ModalMessage, type ModalDialogHandle } from "@/components/ModalDialog";
import { formatEventTime } from "@/lib/calendar/month";
import { formatRecordShortDate } from "@/lib/dates/detail";
import { linkRecordToEvent, toEventLinkMessage, unlinkRecordFromEvent } from "@/lib/dates/event-link";
import type { LinkableEvent } from "@/lib/events/record-link";
import { formatEventPeriod } from "@/lib/events/recurrence";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

const describeEventDay = ({ eventDate, period, startTime }: LinkableEvent): string =>
  [period ? formatEventPeriod(period) : formatRecordShortDate({ date: eventDate, endDate: undefined }), startTime && formatEventTime(startTime)]
    .filter(Boolean)
    .join(" · ");

/**
 * 연결을 바꾸고 기록 화면을 새로 받는다. 새 화면이 올 때까지 `isPending`이라 그동안 창을 닫거나 다시 누르지 못한다.
 * 창은 닫지 않는다: 새 화면에서는 이 줄이 다른 줄로 바뀌며 창도 함께 사라지고, 먼저 닫으면 예전 버튼을 다시 누를 수 있다.
 */
const useLinkChange = () => {
  const router = useRouter();
  const [message, setMessage] = useState<string>();
  const [isPending, startChange] = useTransition();

  const runChange = (change: () => Promise<void>) => {
    if (isPending) return;
    setMessage(undefined);
    startChange(async () => {
      try {
        await change();
      } catch (error) {
        console.error(error);
        setMessage(toEventLinkMessage(error));
        return;
      }
      startChange(() => router.refresh());
    });
  };

  return { message, setMessage, isPending, runChange };
};

interface LinkEventButtonProps {
  recordId: string;
  /** 이 기록을 이을 수 있는 일정의 그날. 하나 이상이다 */
  events: LinkableEvent[];
}

/**
 * 기록 상세의 "일정과 잇기"(#237). 기록 기간에 있는 함께 일정을 골라 바로 잇는다.
 *
 * @example <LinkEventButton recordId={record.id} events={events} />
 */
export const LinkEventButton = ({ recordId, events }: LinkEventButtonProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  const [linkingKey, setLinkingKey] = useState<string>();
  const { message, setMessage, isPending, runChange } = useLinkChange();

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage(undefined);
          modalRef.current?.open();
        }}
        className="press-wide mt-4 flex h-11 w-full items-center justify-center rounded-[10px] border border-line text-[14px] text-ink-sub hover:text-ink"
      >
        일정과 잇기
      </button>
      <ModalDialog
        ref={modalRef}
        title="어느 일정과 이을까요?"
        description="이으면 캘린더에서 일정 줄 하나로 보여요."
        isBusy={isPending}
        shouldCloseOnOutsideClick
        shouldGuardDoubleTap
      >
        <ul aria-label="이을 일정" className="relative -mx-1 mt-4 flex max-h-[300px] flex-col gap-2 overflow-y-auto px-1">
          {events.map((event) => {
            const key = `${event.eventId}/${event.eventDate}`;
            return (
              <li key={key}>
                <button
                  type="button"
                  disabled={isPending}
                  aria-label={`${event.title} 일정과 잇기`}
                  onClick={() => {
                    setLinkingKey(key);
                    runChange(() => linkRecordToEvent({ recordId, eventId: event.eventId, eventDate: event.eventDate }));
                  }}
                  className="press-card flex min-h-[51px] w-full flex-col justify-center rounded-[10px] border border-line px-4 py-2 text-left disabled:opacity-50"
                >
                  <span className="truncate text-[15px] text-ink">{event.title}</span>
                  <span className="text-[12px] text-ink-sub">{isPending && linkingKey === key ? "잇는 중…" : describeEventDay(event)}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {message && <ModalMessage>{message}</ModalMessage>}
        <div className="mt-5 flex">
          <button
            type="button"
            disabled={isPending}
            onClick={() => modalRef.current?.close()}
            className="press-wide h-12 flex-1 rounded-[10px] border border-line text-[15px] text-ink hover:bg-background disabled:opacity-50"
          >
            취소
          </button>
        </div>
      </ModalDialog>
    </>
  );
};

interface LinkedEventRowProps {
  recordId: string;
  event: { id: string; title: string; href: string };
}

/**
 * 기록 상세에서 이어진 일정을 보여 주고 연결만 끊는 줄(#237). 기록과 일정은 그대로 남는다. 일정 이름을 누르면 그 일정으로 간다.
 *
 * @example <LinkedEventRow recordId={record.id} event={record.linkedEvent} />
 */
export const LinkedEventRow = ({ recordId, event }: LinkedEventRowProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  const { message, setMessage, isPending, runChange } = useLinkChange();

  return (
    <div className="mt-4 flex min-h-[51px] items-center gap-3 rounded-[10px] border border-line px-4 py-1">
      <span className="w-11 shrink-0 text-[12px] text-label">일정</span>
      <Link href={event.href} transitionTypes={FORWARD_TRANSITION} className="min-w-0 flex-1 truncate py-3 text-[15px] text-ink">
        {event.title}
      </Link>
      <button
        type="button"
        onClick={() => {
          setMessage(undefined);
          modalRef.current?.open();
        }}
        className="press-icon -mr-2 h-11 shrink-0 px-2 text-[13px] text-ink-sub hover:text-ink"
      >
        연결 끊기
      </button>
      <ModalDialog
        ref={modalRef}
        title="일정과 연결을 끊을까요?"
        description="기록과 일정은 그대로 남고, 캘린더에서 두 줄로 따로 보여요."
        isBusy={isPending}
      >
        {message && <ModalMessage>{message}</ModalMessage>}
        <ModalActions
          cancelLabel="취소"
          onCancel={() => modalRef.current?.close()}
          confirmLabel={isPending ? "끊는 중…" : "연결 끊기"}
          onConfirm={() => runChange(() => unlinkRecordFromEvent({ recordId, eventId: event.id }))}
          isDisabled={isPending}
        />
      </ModalDialog>
    </div>
  );
};
