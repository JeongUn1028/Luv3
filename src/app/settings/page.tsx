import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import { LogoutForm } from "@/components/LogoutForm";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { HOME_PATH, SETTINGS_NICKNAME_PATH, SETTINGS_PASSWORD_PATH } from "@/lib/auth/paths";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";

export const metadata: Metadata = { title: "설정 · Luv3" };

const MemberSection = async () => {
  const member = await getCurrentMember();

  return (
    <section aria-labelledby="settings-account" className="flex flex-col">
      <h2 id="settings-account" className="text-[13px] text-ink-sub">
        계정
      </h2>
      <Link
        href={SETTINGS_NICKNAME_PATH}
        transitionTypes={FORWARD_TRANSITION}
        className="press-wide mt-2 flex h-[51px] items-center gap-3 rounded-[10px] bg-surface pr-3 pl-4"
      >
        <span className="shrink-0 text-[13px] text-ink-sub">닉네임</span>
        {/* 예전 닉네임은 20자까지 있을 수 있어 줄여 그린다 */}
        <span className="min-w-0 flex-1 truncate text-right text-[15px] text-ink">{member.nickname}</span>
        <ChevronRightIcon className="size-[18px] shrink-0 text-ink-sub" />
      </Link>
      <Link
        href={SETTINGS_PASSWORD_PATH}
        transitionTypes={FORWARD_TRANSITION}
        className="press-wide mt-3 flex h-[51px] items-center justify-between rounded-[10px] bg-surface pr-3 pl-4 text-[15px] text-ink"
      >
        비밀번호 변경
        <ChevronRightIcon className="size-[18px] text-ink-sub" />
      </Link>
      <LogoutForm />
    </section>
  );
};

const SettingsPage = () => (
  <PageShell
    bottomSpace="sm"
    className="px-4"
    header={<ScreenHeader back={{ href: HOME_PATH }} title="설정" />}
  >
    <div className="mt-6">
      {/* 세션을 읽는 부분만 요청 시점에 렌더링한다(cacheComponents) */}
      <LoadingSuspense
        fallback={
          <SkeletonArea>
            <SkeletonBlock className="h-5 w-10 rounded-[4px]" />
            <SkeletonBlock className="mt-2 h-[51px] rounded-[10px]" />
            <SkeletonBlock className="mt-3 h-[51px] rounded-[10px]" />
            <SkeletonBlock className="mt-3 h-[51px] rounded-[10px]" />
          </SkeletonArea>
        }
      >
        <MemberSection />
      </LoadingSuspense>
    </div>
  </PageShell>
);

export default SettingsPage;
