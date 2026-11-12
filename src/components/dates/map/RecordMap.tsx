"use client";

import { Suspense, useRef, type ReactElement } from "react";
import { SINGLE_PIN_LEVEL } from "./map-drawing";
import { MapLoadStatus } from "./MapLoadStatus";
import { RecordMapPins, type MapPinsResult } from "./RecordMapPins";
import { useKakaoMap } from "./use-kakao-map";

interface RecordMapProps {
  /** 서버가 읽는 중인 지도 핀. 기다리지 않고 지도 틀부터 그린다(#249) */
  pinsPromise: Promise<MapPinsResult>;
  appKey: string;
}

/**
 * 사진 위치를 핀으로 보여 주는 지도의 틀. 지도는 핀을 기다리지 않고 먼저 불러오고, 핀은 읽히는 대로 `RecordMapPins`가 채운다.
 *
 * @example <RecordMap pinsPromise={pinsPromise} appKey={appKey} />
 */
export const RecordMap = ({ pinsPromise, appKey }: RecordMapProps): ReactElement => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { kakao, status, retry } = useKakaoMap({ containerRef, appKey, initialLevel: SINGLE_PIN_LEVEL });

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      {/* isolate: SDK가 지도 안쪽에 주는 z-index가 아래 칸 위로 올라오지 않게 가둔다 */}
      <div ref={containerRef} className="isolate absolute inset-0 bg-surface" />

      <MapLoadStatus status={status} onRetry={retry} />

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
