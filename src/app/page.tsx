import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { CalendarView } from "@/components/calendar/CalendarView";
import { AlbumGrid } from "@/components/home/AlbumGrid";
import { DdayHeader } from "@/components/home/DdayHeader";
import { HomePager } from "@/components/home/HomePager";
import { SettingsIcon } from "@/components/icons";
import { ANNIVERSARY_DATE, countDaysTogether, formatSinceLabel, toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import type { AlbumTile } from "@/lib/dates/album";
import { parseMonth } from "@/lib/calendar/month";
import { AlbumLoadError, getAlbumTiles } from "@/lib/dates/queries";
import { EventLoadError, getCalendarMonth } from "@/lib/events/queries";

type SearchParams = PageProps<"/">["searchParams"];

/** 그리드를 못 불러와도 D-day와 탭은 쓸 수 있게, 이 에러만 패널 안 문구로 바꾼다 */
const loadAlbumTiles = async (): Promise<AlbumTile[] | AlbumLoadError> => {
  try {
    return await getAlbumTiles();
  } catch (error) {
    if (error instanceof AlbumLoadError) return error;
    throw error;
  }
};

const RecordsPanel = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const days = countDaysTogether(ANNIVERSARY_DATE, toKstDate(new Date()));
  const tiles = await loadAlbumTiles();

  return (
    <div className="flex min-h-full flex-col px-4">
      <DdayHeader days={days} sinceLabel={formatSinceLabel(ANNIVERSARY_DATE)} />
      {tiles instanceof AlbumLoadError ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <p role="alert" className="text-[13px] text-ink-sub">
            {tiles.message}
          </p>
        </div>
      ) : (
        <AlbumGrid tiles={tiles} />
      )}
    </div>
  );
};

/** 일정을 못 불러와도 기록 페이지와 탭은 쓸 수 있게, 이 에러만 패널 안 문구로 바꾼다 */
const loadCalendarMonth = async (month: string) => {
  try {
    return await getCalendarMonth(month);
  } catch (error) {
    if (error instanceof EventLoadError) return error;
    throw error;
  }
};

const CalendarPanel = async ({ searchParams }: { searchParams: SearchParams }) => {
  const { month: monthParam, date: dateParam } = await searchParams;
  const today = toKstDate(new Date());
  const month = parseMonth(monthParam, today);
  const result = await loadCalendarMonth(month);

  if (result instanceof EventLoadError) {
    return (
      <div className="flex h-full items-center justify-center px-4">
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

const HomeContent = async ({ searchParams }: { searchParams: SearchParams }) => {
  // 페이지(view)를 정하는 URL 쿼리는 요청마다 다르므로 미리 렌더링하지 않고 요청 때 그린다
  await connection();

  return (
    <HomePager
      records={
        <Suspense>
          <RecordsPanel />
        </Suspense>
      }
      calendar={
        <Suspense>
          <CalendarPanel searchParams={searchParams} />
        </Suspense>
      }
    />
  );
};

const HomePage = ({ searchParams }: PageProps<"/">) => (
  <main className="mx-auto flex h-dvh w-full max-w-[430px] flex-col">
    <header className="flex shrink-0 items-center justify-end px-2 pt-[env(safe-area-inset-top)]">
      <Link
        href="/settings"
        aria-label="설정"
        className="flex size-11 items-center justify-center text-ink-sub hover:text-ink"
      >
        <SettingsIcon className="size-[22px]" />
      </Link>
    </header>
    {/* 요청 때 그리는 부분은 Suspense 안에 둔다(cacheComponents) */}
    <Suspense fallback={<div className="flex-1" />}>
      <HomeContent searchParams={searchParams} />
    </Suspense>
  </main>
);

export default HomePage;
