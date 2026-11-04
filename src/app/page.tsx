import { Suspense } from "react";
import { CouplePhoto } from "@/components/home/CouplePhoto";
import { DdayHeader } from "@/components/home/DdayHeader";
import { HomeTile, HomeTileMessage } from "@/components/home/HomeTile";
import { LatestRecordCard } from "@/components/home/LatestRecordCard";
import { TodoPreview } from "@/components/home/TodoPreview";
import { UpcomingEventList } from "@/components/home/UpcomingEventList";
import { SettingsIcon } from "@/components/icons";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { ANNIVERSARY_DATE, countDaysTogether, toKstDate } from "@/lib/anniversary";
import { getCurrentMember } from "@/lib/auth/member";
import { CALENDAR_PATH, toCalendarHref } from "@/lib/calendar/month";
import { CouplePhotoLoadError, getCouplePhotoUrl } from "@/lib/couple-photo/queries";
import { RECORDS_PATH } from "@/lib/dates/album";
import { AlbumLoadError, getLatestRecord } from "@/lib/dates/queries";
import { EventLoadError, getUpcomingEvents } from "@/lib/events/queries";
import { describeUpcomingDay, pickUpcomingDay } from "@/lib/events/upcoming";
import { catchLoadError } from "@/lib/load";
import { groupTodos } from "@/lib/todos/list";
import { getTodos, TodoLoadError } from "@/lib/todos/queries";

/** 홈에 보여 줄 하고 싶은 것 개수(맨 위부터) */
const TODO_PREVIEW_COUNT = 3;

// 칸마다 세션을 읽고 따로 불러와서, 한 칸이 느리거나 실패해도 나머지 칸은 먼저 보인다.
// 각 칸에서 getCurrentMember를 부르는 이유: 허용목록 밖 계정이 먼저 그려진 칸을 누르지 않게 로그아웃 처리 경로로 보낸다

const HomeDday = async () => {
  await getCurrentMember();
  const days = countDaysTogether(ANNIVERSARY_DATE, toKstDate(new Date()));

  return <DdayHeader days={days} />;
};

const HomeCouplePhoto = async () => {
  await getCurrentMember();
  const photoUrl = await catchLoadError(getCouplePhotoUrl, CouplePhotoLoadError);

  if (photoUrl instanceof CouplePhotoLoadError) {
    return (
      <p role="alert" className="flex h-[120px] shrink-0 items-center justify-center text-[13px] text-ink-sub">
        {photoUrl.message}
      </p>
    );
  }
  return <CouplePhoto photoUrl={photoUrl} />;
};

const HomeLatestRecord = async () => {
  await getCurrentMember();
  const record = await catchLoadError(getLatestRecord, AlbumLoadError);

  if (record instanceof AlbumLoadError) {
    return (
      <HomeTile title="최근 데이트" more={{ href: RECORDS_PATH, target: "기록" }} isOutlined>
        <HomeTileMessage text={record.message} isError />
      </HomeTile>
    );
  }
  if (!record) {
    return (
      <HomeTile title="최근 데이트" isOutlined>
        <HomeTileMessage text="아직 남긴 기록이 없어요" action={{ href: "/dates/new", label: "첫 데이트 남기기" }} />
      </HomeTile>
    );
  }
  return <LatestRecordCard record={record} />;
};

const HomeUpcomingEvents = async () => {
  await getCurrentMember();
  const today = toKstDate(new Date());
  const events = await catchLoadError(() => getUpcomingEvents(today), EventLoadError);

  if (events instanceof EventLoadError) {
    return (
      <HomeTile title="일정" more={{ href: CALENDAR_PATH, target: "캘린더" }} isOutlined>
        <HomeTileMessage text={events.message} isError />
      </HomeTile>
    );
  }

  const day = pickUpcomingDay(events, today);
  if (!day) {
    return (
      <HomeTile title="일정" isOutlined>
        <HomeTileMessage text="다가오는 일정이 없어요" action={{ href: "/events/new", label: "일정 추가" }} />
      </HomeTile>
    );
  }

  const { title, dateLabel, relativeLabel } = describeUpcomingDay(day.date, today);
  return (
    <HomeTile title={title} detail={relativeLabel} more={{ href: toCalendarHref({ date: day.date }), target: "캘린더" }}>
      <p className="truncate text-[12px] leading-4 text-ink-sub">{dateLabel}</p>
      <UpcomingEventList events={day.events} />
    </HomeTile>
  );
};

const HomeTodos = async () => {
  await getCurrentMember();
  const todos = await catchLoadError(getTodos, TodoLoadError);

  if (todos instanceof TodoLoadError) return <TodoPreview todos={[]} errorMessage={todos.message} />;
  return <TodoPreview todos={groupTodos(todos).open.slice(0, TODO_PREVIEW_COUNT)} />;
};

/** 정사각형 칸을 불러오는 동안 자리만 잡아 둔다 */
const TilePlaceholder = () => <div aria-hidden="true" className="aspect-square rounded-[16px] bg-surface" />;

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
    className="px-4 pb-2.5"
  >
    {/* 세션을 읽고 오늘 날짜로 세는 부분만 요청 때 그린다(cacheComponents).
        빈 자리 높이는 DdayHeader를 그린 높이(66px)라, DdayHeader 여백·글자 크기를 바꾸면 같이 맞춘다 */}
    <Suspense fallback={<div className="h-[66px] shrink-0" />}>
      <HomeDday />
    </Suspense>
    {/* 사진이 있을 때가 대부분이라 빈 자리는 사진 칸 크기로 둔다 */}
    <Suspense fallback={<div className="aspect-[4/3] shrink-0 rounded-[16px] bg-surface" />}>
      <HomeCouplePhoto />
    </Suspense>
    <div className="mt-2.5 grid shrink-0 grid-cols-2 gap-2.5">
      <Suspense fallback={<TilePlaceholder />}>
        <HomeLatestRecord />
      </Suspense>
      <Suspense fallback={<TilePlaceholder />}>
        <HomeUpcomingEvents />
      </Suspense>
    </div>
    {/* 빈 자리 높이는 내용이 한 줄일 때의 TodoPreview 높이(72px)다 */}
    <Suspense fallback={<div className="mt-2.5 h-[72px] shrink-0 rounded-[16px] bg-surface" />}>
      <HomeTodos />
    </Suspense>
  </TabScreen>
);

export default HomePage;
