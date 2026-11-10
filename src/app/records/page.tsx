import type { Metadata } from "next";
import { AlbumGridSkeleton } from "@/components/dates/AlbumGridSkeleton";
import { RecordsBrowser } from "@/components/dates/RecordsBrowser";
import { RecordsLoadFailedMark } from "@/components/dates/RecordsLoadFailedMark";
import { RecordsSearchButton } from "@/components/dates/RecordsSearchButton";
import { MapPinIcon, PlusIcon } from "@/components/icons";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { getCurrentMember } from "@/lib/auth/member";
import { RECORDS_MAP_PATH } from "@/lib/dates/map";
import { AlbumLoadError, getAlbumTiles, getTagSuggestions } from "@/lib/dates/queries";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "기록 · Luv3" };

const RecordsContent = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  // 그리드를 못 불러와도 머리글과 하단 탭은 쓸 수 있게, 이 에러만 화면 안 문구로 바꾼다. 태그 줄은 못 읽으면 비워 둔다
  const [tiles, tags] = await Promise.all([catchLoadError(getAlbumTiles, AlbumLoadError), getTagSuggestions()]);

  if (tiles instanceof AlbumLoadError) {
    return (
      <>
        <RecordsLoadFailedMark />
        <LoadErrorMessage message={tiles.message} />
      </>
    );
  }
  return <RecordsBrowser tiles={tiles} tags={tags} />;
};

const RecordsPage = () => (
  <TabScreen
    tab="records"
    title="기록"
    actions={
      <>
        <RecordsSearchButton />
        {process.env.NEXT_PUBLIC_KAKAO_MAP_KEY && (
          <ScreenHeaderLink href={RECORDS_MAP_PATH} label="지도로 보기">
            <MapPinIcon className="size-[22px]" />
          </ScreenHeaderLink>
        )}
        <ScreenHeaderLink href="/dates/new" label="기록 남기기">
          <PlusIcon className="size-6" />
        </ScreenHeaderLink>
      </>
    }
    className="px-4"
  >
    {/* 세션을 읽는 부분만 요청 때 그린다(cacheComponents) */}
    <LoadingSuspense fallback={<AlbumGridSkeleton />}>
      <RecordsContent />
    </LoadingSuspense>
  </TabScreen>
);

export default RecordsPage;
