import Link from "next/link";
import type { ReactElement } from "react";
import { AuthorHeart } from "@/components/AuthorHeart";
import { EventTimeLabel } from "@/components/events/EventTimeLabel";
import { toCalendarHref } from "@/lib/calendar/month";
import type { CalendarEvent } from "@/lib/events/calendar";

interface UpcomingEventListProps {
  /** 하루치 일정(`pickUpcomingDay`가 고르고 정렬한 순서) */
  events: CalendarEvent[];
}

/**
 * 홈의 오늘·다음 일정 목록. 같은 날 일정이 여러 개여도 모두 작게 보여 준다.
 * 줄을 누르면 캘린더 탭에서 그날을 연다.
 */
export const UpcomingEventList = ({ events }: UpcomingEventListProps): ReactElement => (
  <ul className="flex flex-col gap-1.5">
    {events.map((event) => (
      <li key={event.id}>
        <Link
          href={toCalendarHref({ date: event.date })}
          className="flex min-h-11 items-center gap-3 rounded-[10px] bg-surface py-0.5 pr-2 pl-3"
        >
          <EventTimeLabel event={event} />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] text-ink">{event.title}</span>
            {event.place && <span className="truncate text-[12px] text-ink-sub">{event.place}</span>}
          </span>
          {event.authorNickname && <AuthorHeart nickname={event.authorNickname} />}
        </Link>
      </li>
    ))}
  </ul>
);
