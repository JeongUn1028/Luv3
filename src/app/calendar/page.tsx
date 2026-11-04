import type { Metadata } from "next";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { CalendarView } from "@/components/calendar/CalendarView";
import { PlusIcon } from "@/components/icons";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { parseMonth } from "@/lib/calendar/month";
import { EventLoadError, getCalendarMonth } from "@/lib/events/queries";

export const metadata: Metadata = { title: "캘린더 · Luv3" };

/** 일정을 못 불러와도 머리글과 하단 탭은 쓸 수 있게, 이 에러만 화면 안 문구로 바꾼다 */
const loadCalendarMonth = async (month: string) => {
  try {
    return await getCalendarMonth(month);
  } catch (error) {
    if (error instanceof EventLoadError) return error;
    throw error;
  }
};

const CalendarContent = async ({ searchParams }: Pick<PageProps<"/calendar">, "searchParams">) => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const { month: monthParam, date: dateParam } = await searchParams;
  const today = toKstDate(new Date());
  const month = parseMonth(monthParam, today);
  const result = await loadCalendarMonth(month);

  if (result instanceof EventLoadError) {
    return (
      <div className="flex flex-1 items-center justify-center px-4">
        <p role="alert" className="text-[13px] text-ink-sub">
          {result.message}
        </p>
      </div>
    );
  }
  // 달이나 주소의 날이 바뀌면 고른 날을 다시 정하도록 key로 새로 그린다
  return (
    <CalendarView
      key={`${month}:${String(dateParam)}`}
      month={month}
      today={today}
      requestedDate={dateParam}
      events={result.events}
      records={result.records}
    />
  );
};

const CalendarPage = ({ searchParams }: PageProps<"/calendar">) => (
  <TabScreen
    tab="calendar"
    title="캘린더"
    actions={
      <ScreenHeaderLink href="/events/new" label="일정 추가">
        <PlusIcon className="size-6" />
      </ScreenHeaderLink>
    }
  >
    {/* 세션·주소 쿼리를 읽는 부분만 요청 때 그린다(cacheComponents) */}
    <LoadingSuspense fallback={<CalendarSkeleton />}>
      <CalendarContent searchParams={searchParams} />
    </LoadingSuspense>
  </TabScreen>
);

export default CalendarPage;
