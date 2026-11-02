import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { HomePager } from "@/components/home/HomePager";
import { SettingsIcon } from "@/components/icons";
import { getCurrentMember } from "@/lib/auth/member";

const RecordsPanel = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();

  return (
    <div className="flex h-full items-center justify-center px-4">
      <p className="text-[13px] text-ink-sub">아직 남긴 기록이 없어요</p>
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
