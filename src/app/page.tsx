import { Suspense } from "react";
import { CouplePhoto } from "@/components/home/CouplePhoto";
import { DdayHeader } from "@/components/home/DdayHeader";
import { SettingsIcon } from "@/components/icons";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { ANNIVERSARY_DATE, countDaysTogether, formatSinceLabel, toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { CouplePhotoLoadError, getCouplePhotoUrl } from "@/lib/couple-photo/queries";

const HomeDday = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const days = countDaysTogether(ANNIVERSARY_DATE, toKstDate(new Date()));

  return <DdayHeader days={days} sinceLabel={formatSinceLabel(ANNIVERSARY_DATE)} />;
};

/** 사진을 못 불러와도 홈의 나머지는 쓸 수 있게, 이 에러만 화면 안 문구로 바꾼다 */
const loadCouplePhotoUrl = async (): Promise<string | undefined | CouplePhotoLoadError> => {
  try {
    return await getCouplePhotoUrl();
  } catch (error) {
    if (error instanceof CouplePhotoLoadError) return error;
    throw error;
  }
};

const HomeCouplePhoto = async () => {
  // 허용목록 밖 계정이 사진 칸을 먼저 받아 누르지 않도록, 이 칸에서도 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const photoUrl = await loadCouplePhotoUrl();

  if (photoUrl instanceof CouplePhotoLoadError) {
    return (
      <p role="alert" className="mt-4 flex h-[120px] items-center justify-center text-[13px] text-ink-sub">
        {photoUrl.message}
      </p>
    );
  }
  return <CouplePhoto photoUrl={photoUrl} />;
};

// 나머지 대시보드(최근 데이트·오늘 일정·하고 싶은 것)와 칸 배치는 #62에서 채운다
const HomePage = () => (
  <TabScreen
    tab="home"
    title="홈"
    isTitleHidden
    actions={
      <ScreenHeaderLink href="/settings" label="설정">
        <SettingsIcon className="size-[22px]" />
      </ScreenHeaderLink>
    }
    className="px-4 pb-6"
  >
    {/* 세션을 읽고 오늘 날짜로 세는 부분만 요청 때 그린다(cacheComponents).
        빈 자리 높이는 DdayHeader를 그린 높이(393px 폭에서 잰 167px)라, DdayHeader 여백·글자 크기를 바꾸면 같이 맞춘다 */}
    <Suspense fallback={<div className="h-[167px]" />}>
      <HomeDday />
    </Suspense>
    {/* 사진이 있을 때가 대부분이라 빈 자리는 사진 칸 크기로 둔다 */}
    <Suspense fallback={<div className="mt-4 aspect-[4/3] rounded-[16px] bg-surface" />}>
      <HomeCouplePhoto />
    </Suspense>
  </TabScreen>
);

export default HomePage;
