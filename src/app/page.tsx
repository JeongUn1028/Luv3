import { CouplePhoto } from "@/components/home/CouplePhoto";
import { DdayHeader } from "@/components/home/DdayHeader";
import { CouplePhotoSkeleton, DdaySkeleton, LatestRecordSkeleton, TodoPreviewSkeleton, UpcomingEventSkeleton } from "@/components/home/HomeSkeletons";
import { HomeTile, HomeTileMessage } from "@/components/home/HomeTile";
import { LatestRecordCard } from "@/components/home/LatestRecordCard";
import { TodoPreview } from "@/components/home/TodoPreview";
import { UpcomingEventList } from "@/components/home/UpcomingEventList";
import { SettingsIcon } from "@/components/icons";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { ANNIVERSARY_DATE, countDaysTogether, toKstDate, toKstNow } from "@/lib/anniversary";
import { SETTINGS_PATH } from "@/lib/auth/paths";
import { getCurrentMember } from "@/lib/auth/member";
import { CALENDAR_PATH, toCalendarHref } from "@/lib/calendar/month";
import { CouplePhotoLoadError, getCouplePhoto } from "@/lib/couple-photo/queries";
import { RECORDS_PATH } from "@/lib/dates/album";
import { AlbumLoadError, getLatestRecord } from "@/lib/dates/queries";
import { EventLoadError, getUpcomingEvents } from "@/lib/events/queries";
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
  const photo = await catchLoadError(getCouplePhoto, CouplePhotoLoadError);

  if (photo instanceof CouplePhotoLoadError) {
    return (
      <p role="alert" className="flex h-[120px] shrink-0 items-center justify-center text-[13px] text-ink-sub">
        {photo.message}
      </p>
    );
  }
  return <CouplePhoto photo={photo} />;
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
  const now = toKstNow(new Date());
  const events = await catchLoadError(() => getUpcomingEvents(now), EventLoadError);

  if (events instanceof EventLoadError) {
    return (
      <HomeTile title="일정" more={{ href: CALENDAR_PATH, target: "캘린더" }} isOutlined>
        <HomeTileMessage text={events.message} isError />
      </HomeTile>
    );
  }

  const [firstEvent] = events;
  if (!firstEvent) {
    return (
      <HomeTile title="일정" isOutlined>
        <HomeTileMessage text="다가오는 일정이 없어요" action={{ href: "/events/new", label: "일정 추가" }} />
      </HomeTile>
    );
  }

  return (
    <HomeTile title="다음 일정" more={{ href: toCalendarHref({ date: firstEvent.date }), target: "캘린더" }}>
      <UpcomingEventList events={events} today={now.date} />
    </HomeTile>
  );
};

const HomeTodos = async () => {
  await getCurrentMember();
  const todos = await catchLoadError(getTodos, TodoLoadError);

  if (todos instanceof TodoLoadError) return <TodoPreview todos={[]} errorMessage={todos.message} />;
  return <TodoPreview todos={groupTodos(todos).open.slice(0, TODO_PREVIEW_COUNT)} />;
};

const HomePage = () => (
  <TabScreen
    tab="home"
    title="홈"
    isTitleHidden
    actions={
      <ScreenHeaderLink href={SETTINGS_PATH} label="설정">
        <SettingsIcon className="size-[22px]" />
      </ScreenHeaderLink>
    }
    // 로고가 설정 버튼 아래 줄에 있으면 왼쪽과 가운데가 빈 줄만큼 떠 보여 같은 줄에 놓는다(#98)
    headerCenter={
      // 세션을 읽고 오늘 날짜로 세는 부분만 요청 때 그린다(cacheComponents)
      <LoadingSuspense fallback={<DdaySkeleton />}>
        <HomeDday />
      </LoadingSuspense>
    }
    // 52px 로고가 44px 머리글 아래로 4px 나오므로, 로고 아래 간격 14px에 더한다
    className="px-4 pt-[18px] pb-2.5"
  >
    <LoadingSuspense fallback={<CouplePhotoSkeleton />}>
      <HomeCouplePhoto />
    </LoadingSuspense>
    <div className="mt-4 grid shrink-0 grid-cols-2 gap-2.5">
      <LoadingSuspense fallback={<LatestRecordSkeleton />}>
        <HomeLatestRecord />
      </LoadingSuspense>
      <LoadingSuspense fallback={<UpcomingEventSkeleton />}>
        <HomeUpcomingEvents />
      </LoadingSuspense>
    </div>
    <LoadingSuspense fallback={<TodoPreviewSkeleton />}>
      <HomeTodos />
    </LoadingSuspense>
  </TabScreen>
);

export default HomePage;
