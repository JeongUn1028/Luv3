import type { ReactElement } from "react";
import type { CalendarEvent } from "@/lib/events/calendar";
import { formatEventOwner } from "@/lib/events/calendar";
import { formatEventMeta, formatUpcomingDay, previewUpcomingEvents } from "@/lib/events/upcoming";

interface UpcomingEventListProps {
  /** 앞으로의 일정(`getUpcomingEvents`가 정렬한 순서) */
  events: CalendarEvent[];
  /** 한국 날짜 YYYY-MM-DD */
  today: string;
}

/**
 * 홈 일정 칸의 내용: 가장 가까운 일정 2개, 마지막 날에 못 넣은 일정이 있으면 칸 아래에 "외 N개".
 * 둘째 줄에 누구 일정인지와 언제인지 쓴다(함께는 분홍, 한 사람 일정의 작성자 이름은 크림색으로 캘린더 형광펜과 같은 색이다).
 * 칸이 좁아 작성자 이름표는 그리지 않는다(캘린더 탭에서 보인다).
 *
 * @example <UpcomingEventList events={events} today={now.date} />
 */
export const UpcomingEventList = ({ events, today }: UpcomingEventListProps): ReactElement => {
  const { shown, moreLabel } = previewUpcomingEvents(events);

  return (
    <>
      <ul className="mt-2.5 flex flex-col gap-2">
        {shown.map((event) => (
          <li key={event.id}>
            <p className="truncate text-[14px] leading-5 text-ink">{event.title}</p>
            <p className="truncate text-[12px] leading-4 text-ink-sub">
              <span className={event.isTogether ? "text-highlight" : "text-cream"}>{formatEventOwner(event)} · </span>
              {formatUpcomingDay(event.date, today)} · {formatEventMeta(event)}
            </p>
          </li>
        ))}
      </ul>
      {moreLabel && <p className="mt-auto text-[12px] leading-4 text-accent">{moreLabel}</p>}
    </>
  );
};
