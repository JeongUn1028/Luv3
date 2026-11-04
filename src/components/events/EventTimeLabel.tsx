import type { ReactElement } from "react";
import { formatEventTime } from "@/lib/calendar/month";
import { toOwnerLabel, type CalendarEvent } from "@/lib/events/calendar";

interface EventTimeLabelProps {
  event: Pick<CalendarEvent, "startTime" | "isTogether" | "authorNickname">;
}

/**
 * 캘린더 일정 줄 왼쪽의 시간 칸: "19:30" 또는 "종일", 한 사람 일정이면 아래에 크림색 작성자 닉네임.
 *
 * @example <EventTimeLabel event={event} />
 */
export const EventTimeLabel = ({ event }: EventTimeLabelProps): ReactElement => (
  <span className="flex w-11 shrink-0 flex-col text-[12px] text-ink-sub">
    {formatEventTime(event.startTime)}
    {!event.isTogether && <span className="truncate text-[11px] text-cream">{toOwnerLabel(event.authorNickname)}</span>}
  </span>
);
