import type { Metadata } from "next";
import Link from "next/link";
import { ChevronRightIcon } from "@/components/icons";
import { LogoutForm } from "@/components/LogoutForm";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { HOME_PATH, SETTINGS_NICKNAME_PATH, SETTINGS_PASSWORD_PATH, SETTINGS_TRASH_PATH } from "@/lib/auth/paths";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { ADMDONG_SOURCE } from "@/lib/places/admdong";

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

const linkClassName = "underline underline-offset-2";

/** 사진 동네 이름에 쓰는 행정동 경계의 출처. 원자료(공공누리 제1유형)와 가공분(CC BY 4.0) 모두 출처 표시가 조건이다(#249) */
const DataSourceSection = () => (
  <section aria-labelledby="settings-data-source" className="mt-8 flex flex-col">
    <h2 id="settings-data-source" className="text-[13px] text-ink-sub">
      데이터 출처
    </h2>
    <p className="mt-2 text-[12px] leading-[1.6] text-ink-sub">
      사진의 동네 이름은 행정동 경계({ADMDONG_SOURCE})로 계산해요. 본 데이터는 통계청 통계지리정보서비스(SGIS,{" "}
      <a href="https://sgis.kostat.go.kr" target="_blank" rel="noreferrer" className={linkClassName}>
        https://sgis.kostat.go.kr
      </a>
      )에서 공공누리 제1유형으로 개방한 행정동 경계를 가공한 것이며(가공: vuski/admdongkor,{" "}
      <a href="https://github.com/vuski/admdongkor" target="_blank" rel="noreferrer" className={linkClassName}>
        https://github.com/vuski/admdongkor
      </a>
      ), CC BY 4.0으로 배포됩니다.
    </p>
  </section>
);

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
      <PhotoSection />
      <DataSourceSection />
    </div>
  </PageShell>
);

export default SettingsPage;
