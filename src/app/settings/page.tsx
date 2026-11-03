import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackIcon } from "@/components/icons";
import { ViewportDebugToggle } from "@/components/ViewportDebug";
import { getCurrentMember } from "@/lib/auth/member";

export const metadata: Metadata = { title: "설정 · Luv3" };

const MemberSection = async () => {
  const member = await getCurrentMember();

  return (
    <section aria-labelledby="settings-account" className="flex flex-col">
      <h2 id="settings-account" className="text-[13px] text-ink-sub">
        계정
      </h2>
      <div className="mt-2 flex h-[51px] items-center justify-between rounded-[10px] bg-surface px-4">
        <span className="text-[13px] text-ink-sub">닉네임</span>
        <span className="text-[15px] text-ink">{member.nickname}</span>
      </div>
      <form action="/auth/signout" method="post" className="mt-3">
        <button
          type="submit"
          className="h-[51px] w-full rounded-[10px] border border-line text-[15px] text-ink hover:bg-surface"
        >
          로그아웃
        </button>
      </form>
    </section>
  );
};

const SettingsPage = () => (
  <main className="mx-auto flex min-h-app w-full max-w-[430px] flex-col px-4 pb-[max(24px,env(safe-area-inset-bottom))]">
    <header className="-mx-2 flex shrink-0 items-center pt-[env(safe-area-inset-top)]">
      <Link href="/" aria-label="홈으로" className="flex size-11 items-center justify-center text-ink-sub hover:text-ink">
        <BackIcon className="size-[22px]" />
      </Link>
      <h1 className="text-[17px] text-ink">설정</h1>
    </header>
    <div className="mt-6">
      {/* 세션을 읽는 부분만 요청 시점에 렌더링한다(cacheComponents) */}
      <Suspense fallback={<div className="h-[115px]" />}>
        <MemberSection />
      </Suspense>
    </div>
    {/* TODO(#51): 홈 화면 앱 실기기에서 높이 수정을 확인한 뒤 지운다 */}
    <section aria-labelledby="settings-debug" className="mt-8 flex flex-col">
      <h2 id="settings-debug" className="text-[13px] text-ink-sub">
        화면 진단(임시)
      </h2>
      <div className="mt-2">
        <ViewportDebugToggle />
      </div>
      <p className="mt-2 text-[12px] leading-[1.6] text-ink-sub">
        켜고 나서 앱을 완전히 닫았다가 다시 열면, 처음 띄운 순간의 높이 값이 기록돼요.
      </p>
    </section>
  </main>
);

export default SettingsPage;
