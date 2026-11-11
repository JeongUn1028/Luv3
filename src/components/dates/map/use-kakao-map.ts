"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { loadKakaoMaps, type KakaoMap, type KakaoMaps } from "@/lib/map/kakao-sdk";

/** 불러온 지도. SDK와 지도 객체를 함께 넘긴다 */
export interface LoadedKakaoMap {
  maps: KakaoMaps;
  map: KakaoMap;
}

/** 핀·선을 그리기 전 처음 보여 줄 자리(서울시청). 그린 뒤에는 그것이 모두 보이게 옮긴다 */
const INITIAL_CENTER = { lat: 37.5665, lng: 126.978 };

/** 지도 불러오기 상태 */
export type KakaoMapStatus = "loading" | "ready" | "failed";

interface UseKakaoMapParams {
  containerRef: RefObject<HTMLDivElement | null>;
  appKey: string;
  /** 처음 확대 레벨 */
  initialLevel: number;
}

interface UseKakaoMapResult {
  /** 아직 불러오지 못했으면 undefined */
  kakao: LoadedKakaoMap | undefined;
  status: KakaoMapStatus;
  retry: () => void;
}

/**
 * 카카오 지도를 컨테이너에 한 번 만들고, 컨테이너 크기가 바뀌면 다시 맞춘다. 실패하면 `retry`로 다시 불러온다.
 * cacheComponents가 화면을 Activity로 숨기면 effect가 정리됐다가 다시 돌므로, 지도는 ref에 두어 돌아왔을 때 보던 자리를 지킨다.
 *
 * @example const { kakao, status, retry } = useKakaoMap({ containerRef, appKey, initialLevel: 3 })
 */
export const useKakaoMap = ({ containerRef, appKey, initialLevel }: UseKakaoMapParams): UseKakaoMapResult => {
  const mapRef = useRef<KakaoMap | undefined>(undefined);
  const [kakao, setKakao] = useState<LoadedKakaoMap | undefined>();
  const [status, setStatus] = useState<KakaoMapStatus>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let isActive = true;

    loadKakaoMaps(appKey)
      .then((maps) => {
        if (!isActive) return;
        mapRef.current ??= new maps.Map(container, { center: new maps.LatLng(INITIAL_CENTER.lat, INITIAL_CENTER.lng), level: initialLevel });
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
  }, [containerRef, appKey, loadAttempt, initialLevel]);

  const retry = () => {
    setStatus("loading");
    setLoadAttempt((attempt) => attempt + 1);
  };

  return { kakao, status, retry };
};
