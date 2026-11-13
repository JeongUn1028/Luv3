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

/** 답이 없을 때 그 사진이 "위치 읽는 중"에 머물러 저장을 막지 않게 이만큼만 기다린다. 장소 찾기와 같다 */
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
