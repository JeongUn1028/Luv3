import { isObject } from "@/lib/guards";
import type { PlaceLocation } from "./location";

/** 좌표 → 동네 이름 주소. 화면과 API 경로가 함께 쓴다. 이름은 서버의 행정동 경계로 계산한다(admdong.ts) */
export const PLACE_REGION_PATH = "/api/places/region";

/** 사진 좌표에 동네 이름을 붙이지 못했을 때 쓰는 이름. 올린 파일에서는 GPS를 지우므로 좌표를 버리지 않으려고 둔다(#249 사용자 결정) */
export const UNKNOWN_PHOTO_PLACE = "찍은 곳";

/** 동네 이름을 받아 오지 못했을 때. 서버의 상태 코드가 있으면 `status`에 담는다 */
export class PlaceRegionError extends Error {
  readonly status: number | undefined;

  constructor(options?: ErrorOptions & { status?: number }) {
    super("동네 이름을 받아 오지 못했어요.", options);
    this.name = "PlaceRegionError";
    this.status = options?.status;
  }
}

/** 답이 없을 때 그 사진이 "위치 읽는 중"에 머물러 저장을 막지 않게 이만큼만 기다린다 */
const PLACE_REGION_TIMEOUT_MS = 5000;

/**
 * 화면에서 우리 API(`PLACE_REGION_PATH`)로 좌표의 동네 이름을 받는다. 경계 밖(해외·바다)이면 undefined.
 *
 * @throws {PlaceRegionError} 로그인이 풀렸거나 서버가 실패를 알렸거나 응답이 잘못됐을 때
 * @example const name = await fetchPlaceRegionName({ location: { lat: 37.54, lng: 127.04 } })
 */
export const fetchPlaceRegionName = async ({ location, fetcher = fetch }: { location: PlaceLocation; fetcher?: typeof fetch }): Promise<string | undefined> => {
  const params = new URLSearchParams({ lat: String(location.lat), lng: String(location.lng) });
  const response = await fetcher(`${PLACE_REGION_PATH}?${params.toString()}`, { signal: AbortSignal.timeout(PLACE_REGION_TIMEOUT_MS) }).catch((cause: unknown) => {
    throw new PlaceRegionError({ cause });
  });
  // 로그인이 풀리면 서버가 로그인 화면으로 보내고, fetch는 그 화면을 성공(200)으로 받아 온다
  if (response.redirected || !response.ok) throw new PlaceRegionError({ status: response.status });
  const body: unknown = await response.json().catch((cause: unknown) => {
    throw new PlaceRegionError({ cause });
  });
  if (!isObject(body) || (body.name !== null && typeof body.name !== "string")) throw new PlaceRegionError();
  return body.name ?? undefined;
};

/**
 * 기억할 때 좌표를 이 자릿수로 줄여, 같은 칸(소수 넷째 자리, 약 10m)이면 같은 곳으로 본다. 행정동 경계에 걸친 칸에서는 이웃 동 이름이
 * 붙을 수 있지만, 휴대폰 GPS 오차도 이만큼이라 받아들인다
 */
const REMEMBER_DECIMALS = 4;
/** 기억하는 곳의 수. 넘으면 가장 오래 쓰지 않은 곳부터 잊는다 */
const DEFAULT_REMEMBER_SIZE = 500;

const toRememberKey = ({ lat, lng }: PlaceLocation): string => `${lat.toFixed(REMEMBER_DECIMALS)},${lng.toFixed(REMEMBER_DECIMALS)}`;

/**
 * 받은 동네 이름을 기기 메모리에 기억해, 같은 곳이나 같은 약 10m 칸 안의 가까운 곳은 다시 묻지 않는 읽기 함수를 만든다(#353).
 * 묻는 중인 곳을 또 물으면 같은 요청을 기다리고, 경계 밖(이름 없음)이라는 답도 기억한다. 실패는 기억하지 않아 다음에 다시 묻는다.
 * 기억이 넘치면 가장 오래 쓰지 않은 곳부터 잊어, 지도를 이리저리 옮겨도 자주 찍는 곳은 남긴다.
 *
 * @example const readName = createPlaceRegionNameReader(); await readName({ lat: 37.54, lng: 127.04 })
 */
export const createPlaceRegionNameReader = (
  fetchName: (location: PlaceLocation) => Promise<string | undefined> = (location) => fetchPlaceRegionName({ location }),
  { maxSize = DEFAULT_REMEMBER_SIZE }: { maxSize?: number } = {},
): ((location: PlaceLocation) => Promise<string | undefined>) => {
  const names = new Map<string, Promise<string | undefined>>();
  return (location) => {
    const key = toRememberKey(location);
    const remembered = names.get(key);
    if (remembered) {
      // 맨 뒤로 옮겨 최근에 쓴 곳으로 둔다
      names.delete(key);
      names.set(key, remembered);
      return remembered;
    }
    const name = fetchName(location);
    names.set(key, name);
    // 그 사이 다른 곳을 다시 받아 바뀌었으면 지우지 않는다
    name.catch(() => {
      if (names.get(key) === name) names.delete(key);
    });
    const [oldest] = names.keys();
    if (names.size > maxSize && oldest !== undefined) names.delete(oldest);
    return name;
  };
};

/**
 * 화면에서 쓰는 동네 이름 읽기. 앱을 켜 둔 동안 받은 이름을 기억한다(`createPlaceRegionNameReader`).
 *
 * @throws {PlaceRegionError} 처음 묻는 곳을 받지 못했을 때
 * @example const name = await readPlaceRegionName({ lat: 37.54, lng: 127.04 })
 */
export const readPlaceRegionName = createPlaceRegionNameReader();
