import type { ReactElement } from "react";
import { formatEventTime } from "@/lib/calendar/month";
import type { CalendarEvent } from "@/lib/events/calendar";

interface EventTimeLabelProps {
  event: Pick<CalendarEvent, "startTime" | "isTogether">;
}

/**
 * 일정 줄 왼쪽의 시간 칸: "19:30" 또는 "종일", 개인 일정이면 아래에 크림색 "개인". 캘린더와 홈이 같은 표기를 쓴다.
 *
 * @example <EventTimeLabel event={event} />
 */
export const EventTimeLabel = ({ event }: EventTimeLabelProps): ReactElement => (
  <span className="flex w-11 shrink-0 flex-col text-[12px] text-ink-sub">
    {formatEventTime(event.startTime)}
    {!event.isTogether && <span className="text-[11px] text-cream">개인</span>}
  </span>
);
