import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import { LogoutForm } from "@/components/LogoutForm";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { NotificationSection } from "@/components/settings/NotificationSection";
import { PushTypeSwitches } from "@/components/settings/PushTypeSwitches";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { APP_VERSION } from "@/lib/app-info/version";
import { HOME_PATH, SETTINGS_ABOUT_PATH, SETTINGS_NICKNAME_PATH, SETTINGS_PASSWORD_PATH, SETTINGS_TRASH_PATH } from "@/lib/auth/paths";
import { catchLoadError } from "@/lib/load";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { getPushNotifySettings, PushSettingsLoadError } from "@/lib/push/queries";

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

/** 지운 사진을 30일 동안 보고 휴대폰에 저장하는 휴지통(#311). 세션 없이 그릴 수 있어 Suspense 밖에 둔다 */
const PhotoSection = () => (
  <section aria-labelledby="settings-photos" className="mt-8 flex flex-col">
    <h2 id="settings-photos" className="text-[13px] text-ink-sub">
      사진
    </h2>
    <Link
      href={SETTINGS_TRASH_PATH}
      transitionTypes={FORWARD_TRANSITION}
      className="press-wide mt-2 flex h-[51px] items-center justify-between rounded-[10px] bg-surface pr-3 pl-4 text-[15px] text-ink"
    >
      휴지통
      <ChevronRightIcon className="size-[18px] text-ink-sub" />
    </Link>
  </section>
);

/** 앱 정보(#434): 버전, 업데이트 기록, 함께 쓰는 서비스·출처. 지금 버전을 줄에 함께 보여 준다 */
const AppSection = () => (
  <section aria-labelledby="settings-app" className="mt-8 flex flex-col">
    <h2 id="settings-app" className="text-[13px] text-ink-sub">
      앱
    </h2>
    <Link
      href={SETTINGS_ABOUT_PATH}
      transitionTypes={FORWARD_TRANSITION}
      className="press-wide mt-2 flex h-[51px] items-center gap-3 rounded-[10px] bg-surface pr-3 pl-4 text-[15px] text-ink"
    >
      <span className="flex-1">앱 정보</span>
      <span className="text-ink-sub tabular-nums">v{APP_VERSION}</span>
      <ChevronRightIcon className="size-[18px] shrink-0 text-ink-sub" />
    </Link>
  </section>
);

/** 알림 칸의 종류별 스위치(#364). 사람마다 설정이 있어 세션을 읽는다 */
const PushTypeSwitchesSection = async () => {
  const settings = await catchLoadError(getPushNotifySettings, PushSettingsLoadError);
  if (settings instanceof PushSettingsLoadError) return <LoadErrorMessage message={settings.message} />;
  // 다른 기기에서 바꾼 값이 새로 오면 스위치를 그 값으로 다시 그린다
  return <PushTypeSwitches key={JSON.stringify(settings)} initialSettings={settings} />;
};

// 알림 열쇠를 넣기 전에는 알림 칸을 그리지 않는다(#363, 카카오 지도 키와 같은 방식)
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

const SettingsPage = () => (
  <PageShell
    bottomSpace="sm"
    className="px-4"
    header={<ScreenHeader back={{ href: HOME_PATH }} title="설정" />}
  >
    <div className="mt-6">
      {vapidPublicKey && (
        <NotificationSection
          publicKey={vapidPublicKey}
          typeSwitches={
            // 이 기기에서 알림을 켰을 때만 보인다. 세션을 읽는 부분만 요청 시점에 렌더링한다(cacheComponents)
            <LoadingSuspense fallback={<SkeletonBlock className="mt-2 h-[153px] rounded-[10px]" />}>
              <PushTypeSwitchesSection />
            </LoadingSuspense>
          }
        />
      )}
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
      <PhotoSection />
      <AppSection />
    </div>
  </PageShell>
);

export default SettingsPage;
