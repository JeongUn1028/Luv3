import type { Metadata } from "next";
import { RecordMap } from "@/components/dates/RecordMap";
import { LoadErrorMessage, ScreenMessage } from "@/components/LoadErrorMessage";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { RECORDS_PATH } from "@/lib/dates/album";
import { getMapPins, MapPinLoadError } from "@/lib/dates/queries";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "지도 · Luv3" };

const MapContent = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  // 기록 탭에는 키가 없으면 버튼이 없지만, 주소로 바로 들어올 수 있다
  if (!appKey) return <ScreenMessage message="지금은 지도를 쓸 수 없어요." />;

  const pins = await catchLoadError(getMapPins, MapPinLoadError);
  if (pins instanceof MapPinLoadError) return <LoadErrorMessage message={pins.message} />;
  if (pins.length === 0) return <ScreenMessage message="아직 지도에 표시할 기록이 없어요. 기록을 쓸 때 장소를 찾아 고르면 여기에 나와요." />;
  return <RecordMap pins={pins} appKey={appKey} />;
};

const RecordsMapPage = () => (
  <PageShell header={<ScreenHeader back={{ href: RECORDS_PATH }} title="지도" />}>
    {/* 세션을 읽는 부분만 요청 때 그린다(cacheComponents) */}
    <LoadingSuspense
      fallback={
        <SkeletonArea>
          <SkeletonBlock className="h-full min-h-40 w-full" />
        </SkeletonArea>
      }
    >
      <MapContent />
    </LoadingSuspense>
  </PageShell>
);

export default RecordsMapPage;
