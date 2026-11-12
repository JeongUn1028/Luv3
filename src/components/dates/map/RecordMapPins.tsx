"use client";

import { use, useEffect, useRef, useState, type ReactElement } from "react";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { ScreenMessage } from "@/components/ScreenMessage";
import { fetchMapPhotos } from "@/lib/dates/fetch-map-photos";
import { toMapPinsSignature, type MapPins } from "@/lib/dates/map";
import {
  MAP_PHOTOS_UNAUTHORIZED_STATUS,
  MapPhotosError,
  planThumbRequests,
  toInitialStripPhotos,
  type CachedThumb,
  type MapPhoto,
} from "@/lib/dates/map-photos";
import type { MapPhotoSpot } from "@/lib/dates/map-spots";
import type { KakaoMarkerClusterer } from "@/lib/map/kakao-sdk";
import { isMapClickFromPinPress } from "@/lib/map/pin-press";
import { createClusterer, drawPins, findVisiblePhotoPins, type DrawnPhotoPin, type DrawnPins } from "./map-drawing";
import { MapPhotoStrip } from "./MapPhotoStrip";
import type { LoadedKakaoMap } from "./use-kakao-map";

/** 서버가 읽은 지도 핀. 읽지 못했으면 화면에 보여 줄 문구를 담는다 */
export type MapPinsResult = { status: "loaded"; pins: MapPins } | { status: "failed"; message: string };

interface RecordMapPinsProps {
  pinsPromise: Promise<MapPinsResult>;
  /** 지도를 아직 불러오지 못했으면 undefined. 그동안 핀은 그리지 않고 기다린다 */
  kakao: LoadedKakaoMap | undefined;
}

/** 그린 핀과 그 내용. 내용이 같으면 다시 그리지 않아 보던 자리를 지킨다 */
interface DrawnState extends DrawnPins {
  signature: string;
}

/** 연 칸. 받아 둔 대표 사진이 있으면 서버 응답 전에 먼저 보여 준다(#300) */
interface OpenedSpot {
  key: string;
  initialPhotos: MapPhoto[];
}

/** 핀을 누른 순간 받아 둔 사진으로 연 칸을 만든다. 이미 연 칸이면 그대로 두어 다시 그리지 않는다 */
const toOpenedSpot = (current: OpenedSpot | undefined, key: string, cached: ReadonlyMap<string, CachedThumb>): OpenedSpot =>
  current?.key === key ? current : { key, initialPhotos: toInitialStripPhotos({ coverId: key, cached, now: Date.now() }) };

/** 받은 썸네일을 그 사진이 대표인 핀에 넣는다 */
const showThumb = (pinsByCover: Map<string, DrawnPhotoPin>, photoId: string, url: string): void => {
  pinsByCover.get(photoId)?.pin.showPhoto(url);
};

/**
 * 지도 위의 핀과 핀을 눌렀을 때의 칸. 핀은 서버가 다 읽은 뒤 채운다(지도 틀은 먼저 그린다, #249).
 * 사진 핀의 썸네일은 화면 안에 낱개로 보이는 핀만, 묶음 기능이 다시 묶을 때(`clustered`, 지도가 멈출 때마다)마다 받고 기억해 다시 쓴다.
 * cacheComponents가 화면을 Activity로 숨기면 effect가 정리됐다가 다시 돌므로, 그린 핀은 ref에 두어 돌아왔을 때 다시 그리지 않는다.
 *
 * @example <RecordMapPins pinsPromise={pinsPromise} kakao={kakao} />
 */
export const RecordMapPins = ({ pinsPromise, kakao }: RecordMapPinsProps): ReactElement => {
  const result = use(pinsPromise);
  const clustererRef = useRef<KakaoMarkerClusterer | undefined>(undefined);
  const drawnRef = useRef<DrawnState | undefined>(undefined);
  /** 핀 썸네일과 함께 받은 사진 정보. 핀을 누르면 대표 사진·제목·날짜를 여기서 바로 꺼내 보여 준다 */
  const thumbsRef = useRef(new Map<string, CachedThumb>());
  const pendingThumbsRef = useRef(new Set<string>());
  /** 받아 봤지만 주소가 없던 사진. 지도를 움직일 때마다 다시 묻지 않는다 */
  const unavailableThumbsRef = useRef(new Set<string>());
  /** 마지막으로 핀을 누른 시각(performance.now). 그 누름이 지도로 이어져 칸을 바로 닫지 않게 한다 */
  const pinPressedAtRef = useRef<number | undefined>(undefined);
  const [opened, setOpened] = useState<OpenedSpot | undefined>();
  const pins = result.status === "loaded" ? result.pins : undefined;
  const openSpot = pins?.photoSpots.find(({ key }) => key === opened?.key);

  // 지도의 빈 곳을 누르면 열린 칸을 닫는다
  useEffect(() => {
    if (!kakao) return;
    const handleMapClick = () => {
      if (isMapClickFromPinPress({ pinPressedAt: pinPressedAtRef.current, now: performance.now() })) return;
      setOpened(undefined);
    };
    kakao.maps.event.addListener(kakao.map, "click", handleMapClick);
    return () => kakao.maps.event.removeListener(kakao.map, "click", handleMapClick);
  }, [kakao]);

  // 지도(외부 라이브러리)에 핀을 그리고, 화면 안 사진 핀의 썸네일을 받는다
  useEffect(() => {
    if (!kakao || !pins) return;
    const { maps, map } = kakao;
    clustererRef.current ??= createClusterer(maps, map);
    const clusterer = clustererRef.current;

    const handlePressSpot = (spot: MapPhotoSpot) => {
      pinPressedAtRef.current = performance.now();
      setOpened((current) => toOpenedSpot(current, spot.key, thumbsRef.current));
    };

    // 돌아온 화면은 서버에서 다시 받아 배열이 새것이어도 내용이 같을 수 있다. 내용이 바뀌었을 때만 다시 그려 보던 자리를 지킨다
    const signature = toMapPinsSignature(pins);
    if (drawnRef.current?.signature !== signature) {
      drawnRef.current = { signature, ...drawPins({ maps, map, clusterer, pins, onPressSpot: handlePressSpot }) };
    }
    const { photoPins } = drawnRef.current;
    // 사진 핀의 key가 대표 사진 id다
    const pinsByCover = new Map(photoPins.map((photoPin) => [photoPin.spot.key, photoPin]));

    // 새 핀을 받았거나 화면에 돌아오면 못 받았던 사진도 한 번 더 묻는다
    unavailableThumbsRef.current.clear();
    // 로그인이 풀리면 다시 로그인할 때까지 받지 않는다. 지도를 움직일 때마다 로그인 창을 다시 띄우지 않게 한다
    let isSessionLost = false;

    const loadVisibleThumbs = () => {
      if (isSessionLost) return;
      const coverIds = findVisiblePhotoPins(map, photoPins).map(({ spot }) => spot.key);
      const { ready, batches } = planThumbRequests({
        photoIds: coverIds,
        cached: thumbsRef.current,
        pending: pendingThumbsRef.current,
        unavailable: unavailableThumbsRef.current,
        now: Date.now(),
      });
      ready.forEach(([photoId, url]) => showThumb(pinsByCover, photoId, url));
      for (const batch of batches) {
        batch.forEach((photoId) => pendingThumbsRef.current.add(photoId));
        fetchMapPhotos(batch)
          .then((photos) => {
            const signedIds = new Set<string>();
            for (const photo of photos) {
              const { id, thumbUrl, expiresAt } = photo;
              if (!thumbUrl || expiresAt === undefined) continue;
              signedIds.add(id);
              thumbsRef.current.set(id, { ...photo, thumbUrl, expiresAt });
              showThumb(pinsByCover, id, thumbUrl);
            }
            batch.filter((photoId) => !signedIds.has(photoId)).forEach((photoId) => unavailableThumbsRef.current.add(photoId));
          })
          .catch((error: unknown) => {
            if (error instanceof MapPhotosError && error.status === MAP_PHOTOS_UNAUTHORIZED_STATUS) {
              isSessionLost = true;
              return;
            }
            // 받지 못한 핀은 빈 동그라미로 두고, 지도가 다시 멈출 때 다시 받는다
            console.error("지도 사진 핀 썸네일 받기 실패", error);
          })
          .finally(() => batch.forEach((photoId) => pendingThumbsRef.current.delete(photoId)));
      }
    };

    maps.event.addListener(clusterer, "clustered", loadVisibleThumbs);
    // 이미 묶어 둔 뒤라 알림이 다시 오지 않을 수 있다(돌아온 화면, 바로 묶는 경우)
    loadVisibleThumbs();
    return () => maps.event.removeListener(clusterer, "clustered", loadVisibleThumbs);
  }, [kakao, pins]);

  if (result.status === "failed") {
    return (
      <div className="absolute inset-0 flex flex-col bg-background">
        <LoadErrorMessage message={result.message} />
      </div>
    );
  }
  if (result.pins.photoSpots.length === 0) {
    return (
      <div className="absolute inset-0 flex flex-col bg-background">
        <ScreenMessage message="아직 지도에 표시할 사진이 없어요. 위치가 있는 사진을 올리면 여기에 나와요." />
      </div>
    );
  }

  return (
    <>
      {/* 지도의 핀은 묶이면 숨겨지고 스크린 리더로 찾기 어려워, 같은 자리를 목록으로도 둔다 */}
      <ul aria-label="지도에 있는 사진" className="sr-only">
        {result.pins.photoSpots.map(({ key, place, photoIds }) => (
          <li key={key}>
            <button type="button" onClick={() => setOpened((current) => toOpenedSpot(current, key, thumbsRef.current))}>
              {place} 사진 {photoIds.length}장
            </button>
          </li>
        ))}
      </ul>

      {openSpot && opened && (
        <MapPhotoStrip key={openSpot.key} spot={openSpot} initialPhotos={opened.initialPhotos} onClose={() => setOpened(undefined)} />
      )}
    </>
  );
};
