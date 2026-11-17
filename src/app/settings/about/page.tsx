import type { Metadata } from "next";
import Link from "next/link";
import type { ReactElement, ReactNode } from "react";
import { ChevronRightIcon } from "@/components/icons";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ReleaseHistory } from "@/components/settings/ReleaseHistory";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getReleases } from "@/lib/app-info/releases-server";
import { APP_VERSION } from "@/lib/app-info/version";
import { SETTINGS_ABOUT_LICENSES_PATH, SETTINGS_PATH } from "@/lib/auth/paths";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { ADMDONG_SOURCE } from "@/lib/places/admdong";

export const metadata: Metadata = { title: "앱 정보 · Luv3" };

/** 앱이 기대는 바깥 서비스. 카카오맵과 공공데이터포털은 출처를 밝히고, 나머지는 어디에 쓰는지 알려 준다(#404) */
const SERVICES = [
  { name: "카카오맵", usage: "지도, 위치 고르기, 장소 이름" },
  { name: "공공데이터포털", usage: "공휴일(한국천문연구원 특일 정보)" },
  { name: "Supabase", usage: "로그인, 기록·사진 저장" },
  { name: "Vercel", usage: "앱 운영, 알림 보내기" },
] as const;

/** 앱에 실제로 들어가는 글꼴(layout.tsx의 next/font). 모두 SIL Open Font License 1.1이라 이름과 라이선스를 적는다 */
const FONT_NAMES = "Gowun Dodum · Jua · Cormorant Garamond";

const Section = ({ id, title, children }: { id: string; title: string; children: ReactNode }): ReactElement => (
  <section aria-labelledby={id} className="mt-8 flex flex-col">
    <h2 id={id} className="text-[13px] text-ink-sub">
      {title}
    </h2>
    <div className="mt-2 flex flex-col gap-2">{children}</div>
  </section>
);

const InfoItem = ({ title, detail }: { title: string; detail: string }): ReactElement => (
  <div className="flex flex-col gap-0.5 rounded-[10px] bg-surface px-4 py-3">
    <span className="text-[15px] text-ink">{title}</span>
    <span className="text-[12px] leading-[1.5] text-ink-sub">{detail}</span>
  </div>
);

const linkClassName = "underline underline-offset-2";

const Releases = async (): Promise<ReactElement> => <ReleaseHistory releases={await getReleases()} currentVersion={APP_VERSION} />;

const AboutPage = (): ReactElement => (
  <PageShell bottomSpace="sm" className="px-4" header={<ScreenHeader back={{ href: SETTINGS_PATH }} title="앱 정보" />}>
    <div className="mt-6 flex flex-col items-center gap-1.5">
      {/* 홈 화면 아이콘과 같은 그림. 앱 이름이 바로 아래에 있어 읽지 않는다 */}
      {/* eslint-disable-next-line @next/next/no-img-element -- 정적 아이콘 한 장이라 이미지 최적화가 필요 없다 */}
      <img src="/icon-192.png" alt="" width={72} height={72} className="size-[72px] rounded-[16px] border border-line" />
      <p className="font-display text-[22px] leading-tight text-ink">Luv3</p>
      <p className="text-[13px] text-ink-sub tabular-nums">버전 {APP_VERSION}</p>
    </div>

    <Section id="about-releases" title="업데이트 기록">
      <LoadingSuspense
        fallback={
          <SkeletonArea>
            <SkeletonBlock className="h-[51px] rounded-[10px]" />
            <SkeletonBlock className="mt-2 h-[51px] rounded-[10px]" />
          </SkeletonArea>
        }
      >
        <Releases />
      </LoadingSuspense>
    </Section>

    <Section id="about-services" title="함께 쓰는 서비스">
      {SERVICES.map(({ name, usage }) => (
        <InfoItem key={name} title={name} detail={usage} />
      ))}
    </Section>

    {/* 사진 동네 이름에 쓰는 행정동 경계의 출처. 원자료(공공누리 제1유형)와 가공분(CC BY 4.0) 모두 출처 표시가 조건이다(#249) */}
    <Section id="about-data-source" title="자료 출처">
      <p className="text-[12px] leading-[1.6] text-ink-sub">
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
    </Section>

    <Section id="about-fonts" title="글꼴">
      <InfoItem title={FONT_NAMES} detail="SIL Open Font License 1.1" />
    </Section>

    <Section id="about-open-source" title="오픈소스">
      <Link
        href={SETTINGS_ABOUT_LICENSES_PATH}
        transitionTypes={FORWARD_TRANSITION}
        className="press-wide flex h-[51px] items-center justify-between rounded-[10px] bg-surface pr-3 pl-4 text-[15px] text-ink"
      >
        오픈소스 라이선스
        <ChevronRightIcon className="size-[18px] text-ink-sub" />
      </Link>
    </Section>

    <Section id="about-credit" title="만든 사람">
      <InfoItem title="우리 둘이 쓰려고 만들었어요" detail="2026년 11월 2일 시작" />
    </Section>
  </PageShell>
);

export default AboutPage;
