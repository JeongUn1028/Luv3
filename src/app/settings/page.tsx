import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BackIcon } from "@/components/icons";
import { PageShell } from "@/components/PageShell";
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
  <PageShell
    bottomSpace="sm"
    className="px-4"
    header={
      <header className="flex items-center px-2">
        <Link href="/" aria-label="홈으로" className="flex size-11 items-center justify-center text-ink-sub hover:text-ink">
          <BackIcon className="size-[22px]" />
        </Link>
        <h1 className="text-[17px] text-ink">설정</h1>
      </header>
    }
  >
    <div className="mt-6">
      {/* 세션을 읽는 부분만 요청 시점에 렌더링한다(cacheComponents) */}
      <Suspense fallback={<div className="h-[115px]" />}>
        <MemberSection />
      </Suspense>
    </div>
  </PageShell>
);

export default SettingsPage;
