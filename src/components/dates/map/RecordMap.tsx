"use client";

import { Suspense, useEffect, useRef, useState, type ReactElement } from "react";
import { loadKakaoMaps, type KakaoMap } from "@/lib/map/kakao-sdk";
import { SINGLE_PIN_LEVEL } from "./map-drawing";
import { RecordMapPins, type LoadedKakaoMap, type MapPinsResult } from "./RecordMapPins";

/** 핀을 읽기 전 처음 보여 줄 자리(서울시청). 핀이 오면 핀이 모두 보이게 옮긴다 */
const INITIAL_CENTER = { lat: 37.5665, lng: 126.978 };

type MapStatus = "loading" | "ready" | "failed";

interface RecordMapProps {
  /** 서버가 읽는 중인 지도 핀. 기다리지 않고 지도 틀부터 그린다(#249) */
  pinsPromise: Promise<MapPinsResult>;
  appKey: string;
}

/**
 * 기록·사진 위치를 핀으로 보여 주는 지도의 틀. 지도는 핀을 기다리지 않고 먼저 불러오고, 핀은 읽히는 대로 `RecordMapPins`가 채운다.
 * cacheComponents가 화면을 Activity로 숨기면 effect가 정리됐다가 다시 돌므로, 지도는 ref에 두어 돌아왔을 때 보던 자리를 지킨다.
 *
 * @example <RecordMap pinsPromise={pinsPromise} appKey={appKey} />
 */
export const RecordMap = ({ pinsPromise, appKey }: RecordMapProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<KakaoMap | undefined>(undefined);
  const [kakao, setKakao] = useState<LoadedKakaoMap | undefined>();
  const [status, setStatus] = useState<MapStatus>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let isActive = true;

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (!isActive) return;
        mapRef.current ??= new maps.Map(container, { center: new maps.LatLng(INITIAL_CENTER.lat, INITIAL_CENTER.lng), level: SINGLE_PIN_LEVEL });
        const map = mapRef.current;
        // 숨겨졌던 동안에는 크기를 잴 수 없어 지도 조각이 어긋날 수 있다
        map.relayout();
        setKakao((current) => current ?? { maps, map });
        setStatus("ready");
      })
      .catch((error: unknown) => {
        // 다시 시도해도 실패할 때(키·도메인 설정, 코드 오류) 원인을 찾을 수 있게 남긴다
        console.error("지도 불러오기 실패", error);
        if (isActive) setStatus("failed");
      });

    const resizeObserver = new ResizeObserver(() => mapRef.current?.relayout());
    resizeObserver.observe(container);
    return () => {
      isActive = false;
      resizeObserver.disconnect();
    };
  }, [appKey, loadAttempt]);

  const handleRetry = () => {
    setStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  };

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {/* isolate: SDK가 지도 안쪽에 주는 z-index가 아래 칸 위로 올라오지 않게 가둔다 */}
      <div ref={containerRef} className="isolate absolute inset-0 bg-surface" />

      {status === "loading" && (
        <p role="status" className="absolute inset-0 flex items-center justify-center text-[13px] text-ink-sub">
          지도를 불러오는 중…
        </p>
      )}
      {status === "failed" && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center">
          <p role="alert" className="text-[13px] text-ink-sub">
            지도를 불러오지 못했어요.
          </p>
          <button type="button" onClick={handleRetry} className="press-icon min-h-11 px-4 text-[13px] text-ink underline">
            다시 시도
          </button>
        </div>
      )}

      <Suspense
        fallback={
          status === "ready" && (
            <p role="status" className="absolute inset-x-0 top-3 z-10 mx-auto w-fit rounded-full bg-background/80 px-3 py-1.5 text-[12px] text-ink-sub">
              핀을 불러오는 중…
            </p>
          )
        }
      >
        <RecordMapPins pinsPromise={pinsPromise} kakao={kakao} />
      </Suspense>
    </div>
  );
};
