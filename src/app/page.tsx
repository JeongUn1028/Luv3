import { cookies } from "next/headers";
import { connection } from "next/server";
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
import { withCurrentMember } from "@/lib/auth/with-member";
import { CALENDAR_PATH, toCalendarHref } from "@/lib/calendar/month";
import { CouplePhotoLoadError, getCouplePhoto } from "@/lib/couple-photo/queries";
import { RECORDS_PATH } from "@/lib/dates/album";
import { AlbumLoadError, getLatestRecord } from "@/lib/dates/queries";
import { EventLoadError, getUpcomingEvents } from "@/lib/events/queries";
import { catchLoadError } from "@/lib/load";
import { HOME_PHOTO_COOKIE, parseHomePhotoCookie, pickHomePhotoSrc, type HomePhotoSlot } from "@/lib/photos/home-photo-cookie";
import type { RememberablePhoto } from "@/lib/photos/remembered-url";
import { getOpenTodoPreview, TodoLoadError } from "@/lib/todos/queries";

/** 탭을 오갈 때 받은 지 이 시간(초)이 안 됐으면 서버에 다시 묻지 않는다(#405). `STALE_AFTER_MS`와 같아야 한다. 저장·지우기 뒤의 router.refresh()는 받아 둔 화면을 비운다 */
export const unstable_dynamicStaleTime = 30;

/** 홈에 보여 줄 하고 싶은 것 개수(맨 위부터) */
const TODO_PREVIEW_COUNT = 3;

// 칸마다 세션을 읽고 따로 불러와서, 한 칸이 느리거나 실패해도 나머지 칸은 먼저 보인다.
// 각 칸에서 회원을 확인하는 이유: 허용목록 밖 계정이 먼저 그려진 칸을 누르지 않게 로그아웃 처리 경로로 보낸다.
// 확인과 조회는 함께 시작한다(#344)

// 홈 사진은 쿠키에 기억한 주소를 HTML에 바로 넣어, 화면 코드가 뜨기 전에 휴대폰이 저장해 둔 사진을 그린다(#356)
const pickServerPhotoSrc = async (photo: RememberablePhoto | undefined, slot: HomePhotoSlot): Promise<string | undefined> => {
  if (!photo) return undefined;
  const remembered = parseHomePhotoCookie((await cookies()).get(HOME_PHOTO_COOKIE)?.value)[slot];
  return pickHomePhotoSrc(photo, remembered, Date.now());
};

const HomeDday = async () => {
  await getCurrentMember();
  const days = countDaysTogether(ANNIVERSARY_DATE, toKstDate(new Date()));

  return <DdayHeader days={days} />;
};

const HomeCouplePhoto = async () => {
  const [, photo] = await withCurrentMember(() => catchLoadError(getCouplePhoto, CouplePhotoLoadError));

  if (photo instanceof CouplePhotoLoadError) {
    return (
      <p role="alert" className="flex h-[120px] shrink-0 items-center justify-center text-[13px] text-ink-sub">
        {photo.message}
      </p>
    );
  }
  return <CouplePhoto photo={photo} serverSrc={await pickServerPhotoSrc(photo, "couple")} />;
};

const HomeLatestRecord = async () => {
  const [, record] = await withCurrentMember(() => catchLoadError(getLatestRecord, AlbumLoadError));

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
  return <LatestRecordCard record={record} serverSrc={await pickServerPhotoSrc(record.thumb, "latest")} />;
};

const HomeUpcomingEvents = async () => {
  // 회원 확인을 기다리지 않으므로, 지금 시각을 읽기 전에 요청 때 그리는 칸임을 알린다(cacheComponents)
  await connection();
  const now = toKstNow(new Date());
  const [, events] = await withCurrentMember(() => catchLoadError(() => getUpcomingEvents(now), EventLoadError));

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
  const [, preview] = await withCurrentMember(() => catchLoadError(() => getOpenTodoPreview(TODO_PREVIEW_COUNT), TodoLoadError));

  if (preview instanceof TodoLoadError) return <TodoPreview todos={[]} errorMessage={preview.message} />;
  return <TodoPreview todos={preview.todos} isAllScheduled={preview.isAllScheduled} />;
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
