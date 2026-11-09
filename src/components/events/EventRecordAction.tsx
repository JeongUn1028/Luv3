import Link from "next/link";
import type { ReactElement } from "react";
import { toEventRecordHref, type EventRecordLink } from "@/lib/events/record-link";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

interface EventRecordActionProps {
  eventId: string;
  link: EventRecordLink;
  /** 일정 줄이 여럿인 캘린더에서 어느 일정의 버튼인지 읽어 주려고 붙인다 */
  eventTitle?: string;
  className: string;
}

/**
 * 일정에서 남긴 기록으로 가거나 그날로 기록을 남기는 버튼(#227). 캘린더 일정 줄과 일정 고치기 머리글이 같이 쓴다.
 *
 * @example <EventRecordAction eventId={event.id} link={link} eventTitle={event.title} className="..." />
 */
export const EventRecordAction = ({ eventId, link, eventTitle, className }: EventRecordActionProps): ReactElement => {
  const label = link.kind === "view" ? "기록 보기" : "기록 남기기";
  return (
    <Link
      href={toEventRecordHref(eventId, link)}
      transitionTypes={FORWARD_TRANSITION}
      aria-label={eventTitle ? `${eventTitle} ${label}` : undefined}
      className={className}
    >
      {label}
    </Link>
  );
};
