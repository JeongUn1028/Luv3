import type { ReactElement } from "react";
import type { CalendarEvent } from "@/lib/events/calendar";
import { formatEventMeta, formatEventOwner, previewUpcomingEvents } from "@/lib/events/upcoming";

interface UpcomingEventListProps {
  /** 하루치 일정(`pickUpcomingDay`가 고르고 정렬한 순서) */
  events: CalendarEvent[];
}

/**
 * 홈 일정 칸의 내용: 일정 2개까지, 더 있으면 칸 아래에 "외 N개".
 * 둘째 줄 앞에 누구 일정인지 쓴다(함께는 분홍, 개인 일정의 작성자 이름은 크림색으로 캘린더 형광펜과 같은 색이다).
 * 칸이 좁아 작성자 하트는 그리지 않는다(캘린더 탭에서 보인다).
 *
 * @example <UpcomingEventList events={day.events} />
 */
export const UpcomingEventList = ({ events }: UpcomingEventListProps): ReactElement => {
  const { shown, moreLabel } = previewUpcomingEvents(events);

  return (
    <>
      <ul className="mt-2.5 flex flex-col gap-2">
        {shown.map((event) => (
          <li key={event.id}>
            <p className="truncate text-[14px] leading-5 text-ink">{event.title}</p>
            <p className="truncate text-[12px] leading-4 text-ink-sub">
              <span className={event.isTogether ? "text-highlight" : "text-cream"}>{formatEventOwner(event)} · </span>
              {formatEventMeta(event)}
            </p>
          </li>
        ))}
      </ul>
      {moreLabel && <p className="mt-auto text-[12px] leading-4 text-accent">{moreLabel}</p>}
    </>
  );
};
