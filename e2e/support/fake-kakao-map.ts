import type { Page } from "@playwright/test";

/** 카카오 지도 SDK 주소. 테스트가 이 요청을 붙잡아 가짜 SDK를 돌려준다 */
export const KAKAO_SDK_URL = "**/dapi.kakao.com/v2/maps/sdk.js*";

/** 가짜 지도에서 "화면 안"으로 칠 범위. 없으면 모든 좌표가 화면 안이다 */
export interface FakeViewBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * 실제 카카오를 부르지 않게 지도 SDK를 대신하는 스크립트. 그린 핀과 지도 수를 창에 남겨 테스트가 읽고 누른다.
 * 사진 핀(CustomOverlay)은 실제처럼 지도 요소 안에 붙여 버튼을 누를 수 있다. 위치는 흉내 내지 않아 핀이 모두 왼쪽 위에 겹친다.
 * 선(Polyline)은 그린 좌표와 색만 남긴다(#251).
 * 묶음 기능(MarkerClusterer)은 묶지 않고 모든 핀을 낱개로 보여 주며, 핀을 넣을 때와 `fakeMap.idle()` 때 `clustered`를 알린다.
 * "화면 안"은 `fakeMap.viewBox`로 정한다(`bounds.contain`).
 */
const buildFakeSdk = (viewBox: FakeViewBox | undefined): string => `
const handlersOf = (target) => (target.__handlers ??= {});
const fire = (target, type, argument) => [...(handlersOf(target)[type] ?? [])].forEach((handler) => handler(argument));
window.fakeMap = {
  markers: [], overlays: [], polylines: [], mapCount: 0, boundsCount: 0, centerCount: 0, viewBox: ${JSON.stringify(viewBox ?? null)},
  fire,
  idle: () => {
    fire(window.fakeMap.map, "idle");
    if (window.fakeMap.clusterer) fire(window.fakeMap.clusterer, "clustered", []);
  },
};
class LatLngBounds {
  extend() {}
  contain(latLng) {
    const box = window.fakeMap.viewBox;
    return !box || (latLng.lat >= box.minLat && latLng.lat <= box.maxLat && latLng.lng >= box.minLng && latLng.lng <= box.maxLng);
  }
}
window.kakao = {
  maps: {
    load: (callback) => callback(),
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    LatLngBounds,
    Map: class {
      constructor(container) { this.container = container; window.fakeMap.map = this; window.fakeMap.mapCount += 1; }
      setBounds() { window.fakeMap.boundsCount += 1; }
      setCenter() { window.fakeMap.centerCount += 1; }
      getBounds() { return new LatLngBounds(); }
      relayout() {}
    },
    Marker: class {
      constructor({ position, title }) { this.position = position; this.title = title; }
      setMap(map) {
        window.fakeMap.markers = window.fakeMap.markers.filter((marker) => marker !== this);
        if (map) window.fakeMap.markers.push(this);
      }
    },
    CustomOverlay: class {
      constructor({ position, content }) { this.position = position; this.content = content; this.map = null; }
      setMap(map) {
        this.map = map;
        window.fakeMap.overlays = window.fakeMap.overlays.filter((overlay) => overlay !== this);
        if (map) { map.container.append(this.content); window.fakeMap.overlays.push(this); } else { this.content.remove(); }
      }
      getMap() { return this.map; }
      getPosition() { return this.position; }
    },
    Polyline: class {
      constructor({ path, strokeColor }) { this.path = path.map(({ lat, lng }) => ({ lat, lng })); this.strokeColor = strokeColor; }
      setMap(map) {
        window.fakeMap.polylines = window.fakeMap.polylines.filter((polyline) => polyline !== this);
        if (map) window.fakeMap.polylines.push(this);
      }
    },
    MarkerClusterer: class {
      constructor({ map }) { this.map = map; this.items = []; window.fakeMap.clusterer = this; }
      addMarkers(items) { this.items.push(...items); items.forEach((item) => item.setMap(this.map)); fire(this, "clustered", []); }
      clear() { this.items.forEach((item) => item.setMap(null)); this.items = []; }
    },
    event: {
      addListener: (target, type, handler) => { (handlersOf(target)[type] ??= []).push(handler); },
      removeListener: (target, type, handler) => { handlersOf(target)[type] = (handlersOf(target)[type] ?? []).filter((item) => item !== handler); },
    },
  },
};
`;

/** 페이지에서 읽는 가짜 지도의 모양 */
export interface FakeWindow extends Window {
  fakeMap: {
    markers: { title: string }[];
    polylines: { path: { lat: number; lng: number }[]; strokeColor: string }[];
    mapCount: number;
    boundsCount: number;
    centerCount: number;
    viewBox: FakeViewBox | null;
    fire: (target: unknown, type: string) => void;
    idle: () => void;
  };
}

/**
 * 지도 SDK 요청에 가짜 SDK를 돌려준다. 받은 SDK 주소를 돌려준다.
 *
 * @example await fakeMapSdk(page, { viewBox })
 */
export const fakeMapSdk = async (page: Page, { viewBox }: { viewBox?: FakeViewBox } = {}): Promise<string[]> => {
  const urls: string[] = [];
  await page.route(KAKAO_SDK_URL, (route) => {
    urls.push(route.request().url());
    return route.fulfill({ contentType: "text/javascript", body: buildFakeSdk(viewBox) });
  });
  return urls;
};

/**
 * 가짜 지도의 "화면 안" 범위를 바꾸고 지도가 멈춘 것처럼 알린다(사용자가 지도를 옮긴 것과 같다).
 *
 * @example await moveFakeMap(page, { minLat: 33, maxLat: 34, minLng: 126, maxLng: 127 })
 */
export const moveFakeMap = async (page: Page, viewBox: FakeViewBox): Promise<void> => {
  await page.evaluate((box) => {
    const { fakeMap } = window as unknown as FakeWindow;
    fakeMap.viewBox = box;
    fakeMap.idle();
  }, viewBox);
};

/** 나란히 도는 다른 테스트의 기록과 같은 핀으로 묶이지 않도록 테스트마다 자리를 따로 쓴다 */
export const createUniqueLocation = (): { lat: number; lng: number } => ({ lat: 33 + Math.random() * 5, lng: 125 + Math.random() * 5 });

/**
 * 좌표 둘레의 작은 범위. 다른 테스트의 핀은 이 안에 들어오지 않는다.
 *
 * @example const viewBox = toViewBoxAround(location)
 */
export const toViewBoxAround = ({ lat, lng }: { lat: number; lng: number }): FakeViewBox => ({
  minLat: lat - 0.0001,
  maxLat: lat + 0.0001,
  minLng: lng - 0.0001,
  maxLng: lng + 0.0001,
});
