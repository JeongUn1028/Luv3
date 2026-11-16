import type { ReactElement } from "react";
import { LeaveRecordAction } from "@/components/events/LeaveRecordAction";
import { ViewRecordLink } from "@/components/events/ViewRecordLink";
import type { EventRecordLink } from "@/lib/events/record-link";

interface EventRecordActionProps {
  eventId: string;
  link: EventRecordLink;
  /** 일정 줄이 여럿인 캘린더에서 어느 일정의 버튼인지 읽어 주려고 붙인다 */
  eventTitle?: string;
  className: string;
  /** 이미 쓴 기록을 이은 뒤 화면을 새로 받지 않고 부른 쪽이 버튼을 바꾼다(LeaveRecordAction) */
  onLinked?: (recordId: string) => void;
}

/**
 * 일정에서 남긴 기록으로 가거나 그날로 기록을 남기는 버튼(#227). 캘린더 일정 줄과 일정 고치기 머리글이 같이 쓴다.
 * 남길 때 그날 이미 쓴 기록이 있으면 이을지 고르게 한다(#237).
 *
 * @example <EventRecordAction eventId={event.id} link={link} eventTitle={event.title} className="..." />
 */
export const EventRecordAction = ({ eventId, link, eventTitle, className, onLinked }: EventRecordActionProps): ReactElement => {
  if (link.kind === "leave") {
    return <LeaveRecordAction eventId={eventId} link={link} eventTitle={eventTitle} className={className} onLinked={onLinked} />;
  }
  return <ViewRecordLink eventId={eventId} recordId={link.recordId} eventTitle={eventTitle} className={className} />;
};
