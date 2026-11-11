// 지도 SDK에서 쓰는 부분만 적은 타입이다. 카카오가 타입을 제공하지 않는다

/** 지도의 한 좌표 */
export type KakaoLatLng = object;

/** 지도 객체 */
export interface KakaoMap {
  /** 범위가 모두 보이게 옮긴다. 여백(px)을 주면 가장자리 핀이 잘리지 않는다 */
  setBounds: (bounds: KakaoLatLngBounds, paddingTop?: number, paddingRight?: number, paddingBottom?: number, paddingLeft?: number) => void;
  setCenter: (latLng: KakaoLatLng) => void;
  /** 지금 화면에 보이는 범위 */
  getBounds: () => KakaoLatLngBounds;
  relayout: () => void;
}

/** 지도에 보여 줄 범위 */
export interface KakaoLatLngBounds {
  extend: (latLng: KakaoLatLng) => void;
  contain: (latLng: KakaoLatLng) => boolean;
}

/** 핀 */
export interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void;
}

/** 지도 위에 띄우는 HTML 요소(사진 핀) */
export interface KakaoCustomOverlay {
  setMap: (map: KakaoMap | null) => void;
  /** 지금 지도에 보이면 그 지도. 묶음 동그라미 안으로 들어가 숨겨졌으면 null */
  getMap: () => KakaoMap | null;
  getPosition: () => KakaoLatLng;
}

/** 지도 위에 그리는 선(동선, #251) */
export interface KakaoPolyline {
  setMap: (map: KakaoMap | null) => void;
}

/** 묶음 동그라미 하나에 쓰는 CSS. 카카오가 그대로 붙인다 */
export type KakaoClusterStyle = Record<string, string>;

/** 가까운 핀을 숫자 동그라미로 묶는 기능(clusterer 라이브러리). 화면이 멈출 때마다 다시 묶고 `clustered`를 알린다 */
export interface KakaoMarkerClusterer {
  addMarkers: (markers: (KakaoMarker | KakaoCustomOverlay)[]) => void;
  clear: () => void;
}

type KakaoEventTarget = KakaoMap | KakaoMarker | KakaoMarkerClusterer;
type KakaoEventType = "click" | "clustered";

/** SDK가 `window.kakao.maps`에 내놓는 것 */
export interface KakaoMaps {
  load: (callback: () => void) => void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (options: { position: KakaoLatLng; title: string; clickable: boolean }) => KakaoMarker;
  CustomOverlay: new (options: {
    position: KakaoLatLng;
    content: HTMLElement;
    xAnchor: number;
    yAnchor: number;
    clickable: boolean;
    zIndex?: number;
  }) => KakaoCustomOverlay;
  Polyline: new (options: { path: KakaoLatLng[]; strokeWeight: number; strokeColor: string; strokeOpacity: number }) => KakaoPolyline;
  MarkerClusterer: new (options: {
    map: KakaoMap;
    gridSize: number;
    minClusterSize: number;
    averageCenter: boolean;
    styles: KakaoClusterStyle[];
  }) => KakaoMarkerClusterer;
  event: {
    addListener: (target: KakaoEventTarget, type: KakaoEventType, handler: () => void) => void;
    removeListener: (target: KakaoEventTarget, type: KakaoEventType, handler: () => void) => void;
  };
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

/** 지도 SDK 주소. 보안 헤더(CSP)도 이 값의 출처를 허용한다(src/lib/security/headers.ts) */
export const SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";
/** 답이 없을 때 화면이 "불러오는 중"에 머물지 않게 이만큼만 기다린다 */
const SDK_TIMEOUT_MS = 15_000;

/** 지도 SDK를 불러오지 못했을 때 */
export class KakaoSdkLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("지도를 불러오지 못했어요.", options);
    this.name = "KakaoSdkLoadError";
  }
}

const injectSdk = (appKey: string): Promise<KakaoMaps> =>
  new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = (cause: string) => {
      window.clearTimeout(timeout);
      // 다시 시도할 때 새로 불러오도록 지운다
      script.remove();
      reject(new KakaoSdkLoadError({ cause }));
    };
    const timeout = window.setTimeout(() => fail("시간 초과"), SDK_TIMEOUT_MS);

    // 키·도메인 설정이 잘못돼도 스크립트 요청이 거절되어 여기로 온다
    script.onerror = () => fail("스크립트 요청 실패");
    script.onload = () => {
      const maps = window.kakao?.maps;
      if (!maps) {
        fail("kakao.maps 없음");
        return;
      }
      maps.load(() => {
        window.clearTimeout(timeout);
        resolve(maps);
      });
    };
    // 페이지가 그려진 뒤에 넣는 스크립트는 autoload=false와 load 콜백으로 불러야 한다(카카오 문서의 kakao.maps.load)
    // 사진 핀을 숫자 동그라미로 묶는 기능은 clusterer 라이브러리를 함께 불러야 쓸 수 있다(#249)
    script.src = `${SDK_URL}?${new URLSearchParams({ appkey: appKey, autoload: "false", libraries: "clusterer" }).toString()}`;
    document.head.append(script);
  });

let loadingSdk: Promise<KakaoMaps> | undefined;

/**
 * 지도 SDK를 한 번만 불러온다. 지도 화면을 열 때만 불러, 다른 화면은 카카오에 요청하지 않는다. 실패하면 다음에 다시 불러온다.
 *
 * @throws {KakaoSdkLoadError} 인터넷이 끊겼거나, 키·도메인 설정이 잘못됐거나, 답이 없을 때
 * @example const maps = await loadKakaoMaps(appKey)
 */
export const loadKakaoMaps = (appKey: string): Promise<KakaoMaps> => {
  loadingSdk ??= injectSdk(appKey).catch((error: unknown) => {
    loadingSdk = undefined;
    throw error;
  });
  return loadingSdk;
};
