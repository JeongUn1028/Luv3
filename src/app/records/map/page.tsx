import type { Metadata } from "next";
import { RecordMap } from "@/components/dates/map/RecordMap";
import type { MapPinsResult } from "@/components/dates/map/RecordMapPins";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ScreenMessage } from "@/components/ScreenMessage";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { getCurrentMember } from "@/lib/auth/member";
import { RECORDS_PATH } from "@/lib/dates/album";
import { getMapPins, MapPinLoadError } from "@/lib/dates/map-queries";
import type { MapPhotoSpot } from "@/lib/dates/map-spots";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "지도 · Luv3" };

// 오류 객체는 화면(클라이언트)으로 넘길 수 없어 보여 줄 문구만 담는다
const toMapPinsResult = (result: MapPhotoSpot[] | MapPinLoadError): MapPinsResult =>
  result instanceof MapPinLoadError ? { status: "failed", message: result.message } : { status: "loaded", spots: result };

const MapContent = async () => {
  // 허용목록 밖 계정은 여기서 로그아웃 처리 경로로 보낸다
  await getCurrentMember();
  const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
  // 기록 탭에는 키가 없으면 버튼이 없지만, 주소로 바로 들어올 수 있다
  if (!appKey) return <ScreenMessage message="지금은 지도를 쓸 수 없어요." />;

  // 지도 틀을 먼저 그리고 핀은 읽히는 대로 채운다(#249). 기다리지 않고 넘긴다
  const pinsPromise = catchLoadError(getMapPins, MapPinLoadError).then(toMapPinsResult);
  return <RecordMap pinsPromise={pinsPromise} appKey={appKey} />;
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
