import { SESSION_LOST_EVENT } from "@/lib/auth/session-lost";
import { MAP_PHOTOS_UNAUTHORIZED_STATUS, MapPhotosError, parseMapPhotos, toMapPhotosHref, type MapPhoto } from "./map-photos";

/**
 * 지도 사진(썸네일 주소와 기록 제목·날짜)을 우리 API(`/api/records/map-photos`)로 받는다(#249).
 * 로그인이 풀렸으면 보던 지도를 잃지 않게 이 자리에서 다시 로그인하는 창을 띄우고 실패로 끝낸다.
 *
 * @throws {MapPhotosError} 받지 못했거나 로그인이 풀렸을 때(`status` 401)
 * @example const photos = await fetchMapPhotos(spot.photoIds.slice(0, MAP_PHOTO_PAGE_SIZE), controller.signal)
 */
export const fetchMapPhotos = async (photoIds: string[], signal?: AbortSignal): Promise<MapPhoto[]> => {
  const response = await fetch(toMapPhotosHref(photoIds), { signal });
  // 로그인이 풀리면 서버가 로그인 화면으로 보내고, fetch는 그 화면을 성공(200)으로 받아 온다
  if (response.redirected) {
    window.dispatchEvent(new Event(SESSION_LOST_EVENT));
    throw new MapPhotosError({ status: MAP_PHOTOS_UNAUTHORIZED_STATUS });
  }
  if (!response.ok) throw new MapPhotosError({ status: response.status });
  return parseMapPhotos(await response.json());
};
