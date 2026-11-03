import { Suspense } from "react";
import { DdayHeader } from "@/components/home/DdayHeader";
import { SettingsIcon } from "@/components/icons";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { ANNIVERSARY_DATE, countDaysTogether, formatSinceLabel, toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";

const HomeDday = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const days = countDaysTogether(ANNIVERSARY_DATE, toKstDate(new Date()));

  return <DdayHeader days={days} sinceLabel={formatSinceLabel(ANNIVERSARY_DATE)} />;
};

// 대시보드(커플 사진·최근 데이트·오늘 일정·하고 싶은 것)는 #62에서 채운다
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
  </TabScreen>
);

export default HomePage;
