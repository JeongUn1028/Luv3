"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type MouseEvent, type ReactElement } from "react";
import { ModalActions, ModalDialog, ModalMessage, type ModalDialogHandle } from "@/components/ModalDialog";
import { formatRecordShortDate } from "@/lib/dates/detail";
import { fetchLinkableRecords, linkRecordToEvent, toEventLinkMessage, type LinkableRecord } from "@/lib/dates/event-link";
import { toEventRecordHref, type EventRecordLink } from "@/lib/events/record-link";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

const LOAD_FAILED_MESSAGE = "이미 쓴 기록을 불러오지 못했어요. 새 기록은 쓸 수 있어요.";

interface LeaveRecordActionProps {
  eventId: string;
  link: Extract<EventRecordLink, { kind: "leave" }>;
  eventTitle?: string;
  className: string;
  /** 이은 뒤 화면을 새로 받지 않고 부른 쪽이 버튼을 바꾼다. 고치던 내용이 있는 일정 고치기 화면에 쓴다(새로 받으면 폼을 새로 그린다) */
  onLinked?: (recordId: string) => void;
}

// 새 탭·새 창으로 여는 누름은 브라우저에 맡긴다
const isPlainClick = ({ button, metaKey, ctrlKey, shiftKey, altKey }: MouseEvent): boolean =>
  button === 0 && !metaKey && !ctrlKey && !shiftKey && !altKey;

/**
 * 일정의 "기록 남기기"(#237). 그날(기간 일정이면 기간) 아직 어느 일정과도 이어지지 않은 기록이 있으면
 * 새로 쓸지 이미 쓴 기록과 이을지 고르는 창을 띄우고, 없으면 지금처럼 작성 화면으로 간다.
 *
 * @example <LeaveRecordAction eventId={event.id} link={link} eventTitle={event.title} className="..." />
 */
export const LeaveRecordAction = ({ eventId, link, eventTitle, className, onLinked }: LeaveRecordActionProps): ReactElement => {
  const router = useRouter();
  const modalRef = useRef<ModalDialogHandle>(null);
  const [records, setRecords] = useState<LinkableRecord[]>([]);
  const [message, setMessage] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [linkingId, setLinkingId] = useState<string>();
  // 잇기부터 새 화면이 올 때까지 이어진다. 그동안 창을 닫거나 다시 고르지 못하게 한다
  const [isLinking, startLinking] = useTransition();
  const href = toEventRecordHref(eventId, link);

  const goToNewRecord = () => router.push(href, { transitionTypes: FORWARD_TRANSITION });

  const handleClick = async (event: MouseEvent<HTMLAnchorElement>) => {
    if (!isPlainClick(event)) return;
    event.preventDefault();
    if (isLoading) return;
    setIsLoading(true);
    // 상대가 방금 쓴 기록도 보이도록 누를 때마다 새로 읽는다
    const found = await fetchLinkableRecords({ start: link.eventDate, end: link.lastDate }).catch((error: unknown) => {
      console.error(error);
      return undefined;
    });
    setIsLoading(false);
    if (found?.length === 0) {
      goToNewRecord();
      return;
    }
    // 못 읽었으면 새 기록 쓰기만 남긴 창으로 알린다. 조용히 작성 화면으로 가면 이을 기록이 없다고 오해한다
    setRecords(found ?? []);
    setMessage(found ? undefined : LOAD_FAILED_MESSAGE);
    modalRef.current?.open();
  };

  const handleLink = (recordId: string) => {
    if (isLinking) return;
    setLinkingId(recordId);
    setMessage(undefined);
    startLinking(async () => {
      try {
        await linkRecordToEvent({ recordId, eventId, eventDate: link.eventDate });
      } catch (error) {
        console.error(error);
        setMessage(toEventLinkMessage(error));
        setLinkingId(undefined);
        return;
      }
      // 창은 닫지 않는다. 새 화면이 오면 이 버튼이 "기록 보기"로 바뀌며 창도 함께 사라진다.
      // 먼저 닫으면 새 화면이 오기 전까지 예전 "기록 남기기"를 다시 누를 수 있다
      startLinking(() => (onLinked ? onLinked(recordId) : router.refresh()));
    });
  };

  return (
    <>
      <Link
        href={href}
        transitionTypes={FORWARD_TRANSITION}
        aria-label={eventTitle ? `${eventTitle} 기록 남기기` : undefined}
        aria-busy={isLoading}
        onClick={handleClick}
        className={`${className} aria-busy:opacity-50`}
      >
        기록 남기기
      </Link>
      <ModalDialog
        ref={modalRef}
        title="기록을 어떻게 남길까요?"
        description={records.length > 0 ? "이날 쓴 기록 중 아직 일정과 이어지지 않은 기록이 있어요." : undefined}
        isBusy={isLinking}
        shouldCloseOnOutsideClick
        // 고르면 바로 이으므로, 버튼을 두 번 눌러 열린 창의 기록이 눌리지 않게 한다
        shouldGuardDoubleTap
      >
        {records.length > 0 && (
          <ul aria-label="이미 쓴 기록과 잇기" className="relative -mx-1 mt-4 flex max-h-[300px] flex-col gap-2 overflow-y-auto px-1">
            {records.map((record) => (
              <li key={record.id}>
                <button
                  type="button"
                  disabled={isLinking}
                  aria-label={`${record.title} 기록과 잇기`}
                  onClick={() => handleLink(record.id)}
                  className="press-card flex min-h-[60px] w-full items-center gap-3 rounded-[10px] border border-line px-3 py-2 text-left disabled:opacity-50"
                >
                  <span aria-hidden="true" className="size-11 shrink-0 overflow-hidden rounded-[8px] bg-line">
                    {record.thumbUrl && (
                      // eslint-disable-next-line @next/next/no-img-element -- 업로드 때 이미 줄인 썸네일이라 next/image 최적화를 다시 거치지 않는다
                      <img src={record.thumbUrl} alt="" className="size-full object-cover" />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[15px] text-ink">{record.title}</span>
                    <span className="text-[12px] text-ink-sub">
                      {isLinking && linkingId === record.id ? "잇는 중…" : formatRecordShortDate(record)}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {message && <ModalMessage>{message}</ModalMessage>}
        <ModalActions
          cancelLabel="취소"
          onCancel={() => modalRef.current?.close()}
          confirmLabel="새 기록 쓰기"
          onConfirm={() => {
            modalRef.current?.closeImmediately();
            goToNewRecord();
          }}
          isDisabled={isLinking}
        />
      </ModalDialog>
    </>
  );
};
