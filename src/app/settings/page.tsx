import type { Metadata } from "next";
import { LogoutForm } from "@/components/LogoutForm";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { HOME_PATH } from "@/lib/auth/paths";

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
      <LogoutForm />
    </section>
  );
};

const SettingsPage = () => (
  <PageShell
    bottomSpace="sm"
    className="px-4"
    header={<ScreenHeader back={{ href: HOME_PATH, label: "홈으로" }} title="설정" />}
  >
    <div className="mt-6">
      {/* 세션을 읽는 부분만 요청 시점에 렌더링한다(cacheComponents) */}
      <LoadingSuspense
        fallback={
          <SkeletonArea>
            <SkeletonBlock className="h-5 w-10 rounded-[4px]" />
            <SkeletonBlock className="mt-2 h-[51px] rounded-[10px]" />
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
