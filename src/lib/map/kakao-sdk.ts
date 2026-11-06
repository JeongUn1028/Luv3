// 지도 SDK에서 쓰는 부분만 적은 타입이다. 카카오가 타입을 제공하지 않는다

/** 지도의 한 좌표 */
export type KakaoLatLng = object;

/** 지도 객체 */
export interface KakaoMap {
  setBounds: (bounds: KakaoLatLngBounds) => void;
  setCenter: (latLng: KakaoLatLng) => void;
  relayout: () => void;
}

/** 지도에 보여 줄 범위 */
export interface KakaoLatLngBounds {
  extend: (latLng: KakaoLatLng) => void;
}

/** 핀 */
export interface KakaoMarker {
  setMap: (map: KakaoMap | null) => void;
}

/** SDK가 `window.kakao.maps`에 내놓는 것 */
export interface KakaoMaps {
  load: (callback: () => void) => void;
  LatLng: new (lat: number, lng: number) => KakaoLatLng;
  LatLngBounds: new () => KakaoLatLngBounds;
  Map: new (container: HTMLElement, options: { center: KakaoLatLng; level: number }) => KakaoMap;
  Marker: new (options: { position: KakaoLatLng; title: string; clickable: boolean }) => KakaoMarker;
  event: { addListener: (target: KakaoMap | KakaoMarker, type: "click", handler: () => void) => void };
}

declare global {
  interface Window {
    kakao?: { maps: KakaoMaps };
  }
}

const SDK_URL = "https://dapi.kakao.com/v2/maps/sdk.js";
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
    script.src = `${SDK_URL}?${new URLSearchParams({ appkey: appKey, autoload: "false" }).toString()}`;
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
