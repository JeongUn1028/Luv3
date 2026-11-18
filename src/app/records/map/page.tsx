import type { Metadata } from "next";
import { RecordMap } from "@/components/dates/map/RecordMap";
import type { MapPinsResult } from "@/components/dates/map/RecordMapPins";
import { LoadingSuspense } from "@/components/LoadingSuspense";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { ScreenMessage } from "@/components/ScreenMessage";
import { SkeletonArea, SkeletonBlock } from "@/components/Skeleton";
import { withCurrentMember } from "@/lib/auth/with-member";
import { RECORDS_PATH } from "@/lib/dates/album";
import { getMapPins, MapPinLoadError } from "@/lib/dates/map-queries";
import type { MapPhotoSpot } from "@/lib/dates/map-spots";
import { catchLoadError } from "@/lib/load";

export const metadata: Metadata = { title: "지도 · Luv3" };

// 오류 객체는 화면(클라이언트)으로 넘길 수 없어 보여 줄 문구만 담는다
const toMapPinsResult = (result: MapPhotoSpot[] | MapPinLoadError): MapPinsResult =>
  result instanceof MapPinLoadError ? { status: "failed", message: result.message } : { status: "loaded", spots: result };

const MapContent = async () => {
  // 지도 틀을 먼저 그리고 핀은 읽히는 대로 채운다(#249). 핀은 기다리지 않고 넘기므로 약속을 객체에 담아 돌려받는다.
  // 허용목록 확인과 함께 시작하고, 허용목록 밖 계정은 로그아웃 처리 경로로 보낸다
  const [, map] = await withCurrentMember(async () => {
    const appKey = process.env.NEXT_PUBLIC_KAKAO_MAP_KEY;
    if (!appKey) return undefined;
    const pinsPromise = catchLoadError(getMapPins, MapPinLoadError).then(toMapPinsResult);
    // 회원 확인이 이동을 던지면 아무도 받지 않는 약속이 되므로, 처리되지 않은 거부로 남지 않게 한다. 넘긴 약속은 그대로 거부를 전한다
    pinsPromise.catch(() => undefined);
    return { appKey, pinsPromise };
  });
  // 기록 탭에는 키가 없으면 버튼이 없지만, 주소로 바로 들어올 수 있다
  if (!map) return <ScreenMessage message="지금은 지도를 쓸 수 없어요." />;
  return <RecordMap pinsPromise={map.pinsPromise} appKey={map.appKey} />;
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
