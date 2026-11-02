import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { AlbumGrid } from "@/components/home/AlbumGrid";
import { DdayHeader } from "@/components/home/DdayHeader";
import { HomePager } from "@/components/home/HomePager";
import { SettingsIcon } from "@/components/icons";
import { ANNIVERSARY_DATE, countDaysTogether, formatSinceLabel, toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import type { AlbumTile } from "@/lib/dates/album";
import { AlbumLoadError, getAlbumTiles } from "@/lib/dates/queries";

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

const CalendarPanel = () => (
  <div className="flex h-full items-center justify-center px-4">
    <p className="text-[13px] text-ink-sub">공유 캘린더를 준비하고 있어요</p>
  </div>
);

const HomeContent = async () => {
  // 페이지(view)를 정하는 URL 쿼리는 요청마다 다르므로 미리 렌더링하지 않고 요청 때 그린다
  await connection();

  return (
    <HomePager
      records={
        <Suspense>
          <RecordsPanel />
        </Suspense>
      }
      calendar={<CalendarPanel />}
    />
  );
};

const HomePage = () => (
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
      <HomeContent />
    </Suspense>
  </main>
);

export default HomePage;
