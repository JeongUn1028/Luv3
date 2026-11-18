import type { Metadata } from "next";
import { connection } from "next/server";
import { CalendarSkeleton } from "@/components/calendar/CalendarSkeleton";
import { CalendarView } from "@/components/calendar/CalendarView";
import { PlusIcon } from "@/components/icons";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { toKstDate } from "@/lib/anniversary";
import { withCurrentMember } from "@/lib/auth/with-member";
import { getGridRange, parseMonth } from "@/lib/calendar/month";
import { EventLoadError, getCalendarMonth } from "@/lib/events/queries";
import { getHolidayNamesInRange } from "@/lib/holidays/server";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "캘린더 · Luv3" };

/** 탭을 오갈 때 받은 지 이 시간(초)이 안 됐으면 서버에 다시 묻지 않는다(#405). `STALE_AFTER_MS`와 같아야 한다. 저장·지우기 뒤의 router.refresh()는 받아 둔 화면을 비운다 */
export const unstable_dynamicStaleTime = 30;

const CalendarContent = async ({ searchParams }: Pick<PageProps<"/calendar">, "searchParams">) => {
  const { month: monthParam, date: dateParam } = await searchParams;
  // 회원 확인을 기다리지 않으므로, 오늘을 읽기 전에 요청 때 그리는 칸임을 알린다(cacheComponents, #385)
  await connection();
  const today = toKstDate(new Date());
  const month = parseMonth(monthParam, today);
  // 일정을 못 불러와도 머리글과 하단 탭은 쓸 수 있게, 이 에러만 화면 안 문구로 바꾼다.
  // 공휴일은 못 받아도 비어 있을 뿐 화면을 막지 않는다
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다. 확인과 조회는 함께 시작한다(#344)
  const [, [result, holidayNames]] = await withCurrentMember(() =>
    Promise.all([catchLoadError(() => getCalendarMonth(month), EventLoadError), getHolidayNamesInRange(getGridRange(month))]),
  );

  if (result instanceof EventLoadError) return <LoadErrorMessage message={result.message} />;
  // 주소의 날(일정을 저장하고 돌아온 날)이 바뀌면 그날을 고르도록 key로 새로 그린다.
  // 달은 key에 넣지 않는다. 넘긴 달에서 새로 받으면 서버가 그 달을 그리는데, 고른 날은 그대로 두어야 한다(#348)
  return (
    <CalendarView
      key={String(dateParam)}
      month={month}
      today={today}
      requestedDate={dateParam}
      events={result.events}
      records={result.records}
      holidayNames={holidayNames}
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
