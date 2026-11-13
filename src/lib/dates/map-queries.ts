import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { getSignedUrls } from "@/lib/photos/signed-urls";
import { readAllRows } from "@/lib/supabase/read-all-rows";
import { toMapPhotos, type MapPhoto } from "./map-photos";
import { toPhotoSpots, type MapPhotoSpot } from "./map-spots";
import { PHOTO_GROUP_LOCATION_COLUMNS, toPhotoWithGroupLocation } from "./photo-groups";

/** 지도의 핀을 불러오지 못했을 때 */
export class MapPinLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("지도에 표시할 기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "MapPinLoadError";
  }
}

/**
 * 사진을 모음 위치와 함께 읽어 지도의 핀으로 묶는다. 사진은 모두 위치가 있는 모음에 속한다(#297). 1000개가 넘어도 잘리지 않게 끝까지 나눠 읽는다(#272).
 * 핀은 위치·사진 id만 담아 수천 개여도 작다. 카카오 묶음 숫자가 맞으려면 모든 위치가 있어야 해 한 번에 읽고,
 * 느린 썸네일 서명은 화면 안 핀만 `getMapPhotos`로 따로 받는다(#249 사용자 결정).
 *
 * @throws {MapPinLoadError} 조회가 실패했을 때
 * @example const pins = await getMapPins()
 */
export const getMapPins = async (): Promise<MapPhotoSpot[]> => {
  const supabase = await createClient();
  const toError = (cause: unknown) => new MapPinLoadError({ cause });
  const photos = await readAllRows({
    fetchPage: (afterId, limit) => {
      const query = supabase
        .from("photos")
        .select(`id, date_id, sort_order, record:dates!photos_date_id_fkey(date, created_at), ${PHOTO_GROUP_LOCATION_COLUMNS}`);
      return (afterId ? query.gt("id", afterId) : query).order("id").limit(limit);
    },
    toError,
  });
  return toPhotoSpots(photos.map(toPhotoWithGroupLocation));
};

/** 지도의 사진(썸네일·사진 줄)을 불러오지 못했을 때 */
export class MapPhotoLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("사진을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "MapPhotoLoadError";
  }
}

/**
 * 고른 사진들의 썸네일 서명 주소와 기록 제목·날짜를 요청한 순서로 읽는다(지도의 핀 썸네일, 아래 칸 사진 줄).
 * 서명 주소는 서버가 기억해 두고 다시 써서, 같은 사진은 휴대폰이 받아 둔 파일을 그대로 쓴다.
 *
 * @throws {MapPhotoLoadError} 조회나 서명이 실패했을 때
 * @example const photos = await getMapPhotos(["…"])
 */
export const getMapPhotos = async (photoIds: string[]): Promise<MapPhoto[]> => {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("photos")
    .select("id, thumb_path, taken_at, record:dates!photos_date_id_fkey(id, title, date)")
    .in("id", photoIds);
  if (error) throw new MapPhotoLoadError({ cause: error });

  const { data: signed, error: signError } = await getSignedUrls(
    supabase.storage.from(ALBUM_BUCKET),
    rows.map(({ thumb_path: thumbPath }) => thumbPath),
  );
  if (signError) throw new MapPhotoLoadError({ cause: signError });
  return toMapPhotos(photoIds, rows, signed);
};
