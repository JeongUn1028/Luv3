import Link from "next/link";
import type { ReactElement } from "react";
import { toEventRecordHref } from "@/lib/events/record-link";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

interface ViewRecordLinkProps {
  eventId: string;
  recordId: string;
  /** 일정 줄이 여럿인 캘린더에서 어느 일정의 버튼인지 읽어 주려고 붙인다 */
  eventTitle?: string;
  className: string;
}

/**
 * 일정에 이어진 기록으로 가는 "기록 보기" 버튼(#227). 서버가 그린 버튼과, 이은 뒤 새 화면 전에 먼저 그리는 버튼(#346)이 같이 쓴다.
 *
 * @example <ViewRecordLink eventId={event.id} recordId={recordId} eventTitle={event.title} className="..." />
 */
export const ViewRecordLink = ({ eventId, recordId, eventTitle, className }: ViewRecordLinkProps): ReactElement => (
  <Link
    href={toEventRecordHref(eventId, { kind: "view", recordId })}
    transitionTypes={FORWARD_TRANSITION}
    aria-label={eventTitle ? `${eventTitle} 기록 보기` : undefined}
    className={className}
  >
    기록 보기
  </Link>
);
