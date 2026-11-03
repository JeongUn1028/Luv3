import { Suspense } from "react";
import { CouplePhoto } from "@/components/home/CouplePhoto";
import { DdayHeader } from "@/components/home/DdayHeader";
import { HomeMessage, HomeSection } from "@/components/home/HomeSection";
import { LatestRecordCard } from "@/components/home/LatestRecordCard";
import { TodoPreview } from "@/components/home/TodoPreview";
import { UpcomingEventList } from "@/components/home/UpcomingEventList";
import { SettingsIcon } from "@/components/icons";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { ANNIVERSARY_DATE, countDaysTogether, formatSinceLabel, toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { CALENDAR_PATH, toCalendarHref } from "@/lib/calendar/month";
import { CouplePhotoLoadError, getCouplePhotoUrl } from "@/lib/couple-photo/queries";
import { RECORDS_PATH } from "@/lib/dates/album";
import { AlbumLoadError, getLatestRecord } from "@/lib/dates/queries";
import { EventLoadError, getUpcomingEvents } from "@/lib/events/queries";
import { describeUpcomingDay, pickUpcomingDay } from "@/lib/events/upcoming";
import { catchLoadError } from "@/lib/load";
import { groupTodos, TODOS_PATH } from "@/lib/todos/list";
import { getTodos, TodoLoadError } from "@/lib/todos/queries";

/** 홈에 보여 줄 하고 싶은 것 개수(맨 위부터) */
const TODO_PREVIEW_COUNT = 3;

// 칸마다 세션을 읽고 따로 불러와서, 한 칸이 느리거나 실패해도 나머지 칸은 먼저 보인다.
// 각 칸에서 getCurrentMember를 부르는 이유: 허용목록 밖 계정이 먼저 그려진 칸을 누르지 않게 로그아웃 처리 경로로 보낸다

const HomeDday = async () => {
  await getCurrentMember();
  const days = countDaysTogether(ANNIVERSARY_DATE, toKstDate(new Date()));

  return <DdayHeader days={days} sinceLabel={formatSinceLabel(ANNIVERSARY_DATE)} />;
};

const HomeCouplePhoto = async () => {
  await getCurrentMember();
  const photoUrl = await catchLoadError(getCouplePhotoUrl, CouplePhotoLoadError);

  if (photoUrl instanceof CouplePhotoLoadError) {
    return (
      <p role="alert" className="mt-4 flex h-[120px] items-center justify-center text-[13px] text-ink-sub">
        {photoUrl.message}
      </p>
    );
  }
  return <CouplePhoto photoUrl={photoUrl} />;
};

const HomeLatestRecord = async () => {
  await getCurrentMember();
  const record = await catchLoadError(getLatestRecord, AlbumLoadError);

  return (
    <HomeSection title="최근 데이트" more={{ href: RECORDS_PATH, target: "기록" }}>
      {record instanceof AlbumLoadError ? (
        <HomeMessage text={record.message} isError />
      ) : record ? (
        <LatestRecordCard record={record} />
      ) : (
        <HomeMessage text="아직 남긴 기록이 없어요" action={{ href: "/dates/new", label: "첫 데이트 남기기" }} />
      )}
    </HomeSection>
  );
};

const HomeUpcomingEvents = async () => {
  await getCurrentMember();
  const today = toKstDate(new Date());
  const events = await catchLoadError(() => getUpcomingEvents(today), EventLoadError);

  const day = events instanceof EventLoadError ? undefined : pickUpcomingDay(events, today);
  const heading = day ? describeUpcomingDay(day.date, today) : { title: "일정", detail: undefined };

  return (
    <HomeSection
      title={heading.title}
      detail={heading.detail}
      more={{ href: day ? toCalendarHref({ date: day.date }) : CALENDAR_PATH, target: "캘린더" }}
    >
      {events instanceof EventLoadError ? (
        <HomeMessage text={events.message} isError />
      ) : day ? (
        <UpcomingEventList events={day.events} />
      ) : (
        <HomeMessage text="다가오는 일정이 없어요" action={{ href: "/events/new", label: "일정 추가" }} />
      )}
    </HomeSection>
  );
};

const HomeTodos = async () => {
  await getCurrentMember();
  const todos = await catchLoadError(getTodos, TodoLoadError);
  if (todos instanceof TodoLoadError) {
    return (
      <HomeSection title="하고 싶은 것" more={{ href: TODOS_PATH, target: "하고 싶은 것" }}>
        <HomeMessage text={todos.message} isError />
      </HomeSection>
    );
  }

  const topTodos = groupTodos(todos).open.slice(0, TODO_PREVIEW_COUNT);
  return (
    <HomeSection title="하고 싶은 것" more={{ href: TODOS_PATH, target: "하고 싶은 것" }}>
      {topTodos.length > 0 ? (
        <TodoPreview todos={topTodos} />
      ) : (
        <HomeMessage
          text="함께 하고 싶은 것을 적어 보세요"
          action={{ href: `${TODOS_PATH}/new`, label: "하고 싶은 것 추가" }}
        />
      )}
    </HomeSection>
  );
};

/** 칸을 불러오는 동안 자리만 잡아 둔다. 높이는 내용이 한 줄일 때의 칸 높이(제목 44 + 간격 4 + 내용 + 위 여백 24)다 */
const SectionPlaceholder = ({ contentClassName }: { contentClassName: string }) => (
  <div aria-hidden="true" className="mt-6 flex flex-col gap-1">
    <div className="h-11" />
    <div className={`rounded-[12px] bg-surface ${contentClassName}`} />
  </div>
);

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
    <Suspense fallback={<SectionPlaceholder contentClassName="h-[84px]" />}>
      <HomeLatestRecord />
    </Suspense>
    <Suspense fallback={<SectionPlaceholder contentClassName="h-11" />}>
      <HomeUpcomingEvents />
    </Suspense>
    <Suspense fallback={<SectionPlaceholder contentClassName="h-11" />}>
      <HomeTodos />
    </Suspense>
  </TabScreen>
);

export default HomePage;
