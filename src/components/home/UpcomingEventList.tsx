import type { ReactElement } from "react";
import type { CalendarEvent } from "@/lib/events/calendar";
import { formatEventMeta, previewUpcomingEvents } from "@/lib/events/upcoming";

interface UpcomingEventListProps {
  /** 하루치 일정(`pickUpcomingDay`가 고르고 정렬한 순서) */
  events: CalendarEvent[];
}

/**
 * 홈 일정 칸의 내용: 일정 2개까지, 더 있으면 칸 아래에 "외 N개".
 * 개인 일정이면 둘째 줄 앞에 크림색 "개인"을 붙인다. 칸이 좁아 작성자 하트는 그리지 않는다(캘린더 탭에서 보인다).
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
              {!event.isTogether && <span className="text-cream">개인 · </span>}
              {formatEventMeta(event)}
            </p>
          </li>
        ))}
      </ul>
      {moreLabel && <p className="mt-auto text-[12px] leading-4 text-accent">{moreLabel}</p>}
    </>
  );
};
