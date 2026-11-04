import type { Metadata } from "next";
import { AlbumGrid } from "@/components/dates/AlbumGrid";
import { AlbumGridSkeleton } from "@/components/dates/AlbumGridSkeleton";
import { PlusIcon } from "@/components/icons";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { ScreenHeaderLink } from "@/components/ScreenHeader";
import { TabScreen } from "@/components/tabs/TabScreen";
import { getCurrentMember } from "@/lib/auth/member";
import type { AlbumTile } from "@/lib/dates/album";
import { AlbumLoadError, getAlbumTiles } from "@/lib/dates/queries";

export const metadata: Metadata = { title: "기록 · Luv3" };

/** 그리드를 못 불러와도 머리글과 하단 탭은 쓸 수 있게, 이 에러만 화면 안 문구로 바꾼다 */
const loadAlbumTiles = async (): Promise<AlbumTile[] | AlbumLoadError> => {
  try {
    return await getAlbumTiles();
  } catch (error) {
    if (error instanceof AlbumLoadError) return error;
    throw error;
  }
};

const RecordsContent = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const tiles = await loadAlbumTiles();

  if (tiles instanceof AlbumLoadError) {
    return (
      <div className="flex flex-1 items-center justify-center py-12">
        <p role="alert" className="text-[13px] text-ink-sub">
          {tiles.message}
        </p>
      </div>
    );
  }
  return <AlbumGrid tiles={tiles} />;
};

const RecordsPage = () => (
  <TabScreen
    tab="records"
    title="기록"
    actions={
      <ScreenHeaderLink href="/dates/new" label="기록 남기기">
        <PlusIcon className="size-6" />
      </ScreenHeaderLink>
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
