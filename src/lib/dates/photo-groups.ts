/** 사진 행에 붙여 읽는 사진 모음의 위치 칸(`photo_groups`, #297) */
export interface PhotoGroupLocationRow {
  place: string;
  place_lat: number;
  place_lng: number;
}

/**
 * 사진 행과 함께 읽을 모음 위치. 사진에서 모음으로 가는 외래 키를 짚어 PostgREST가 한 행으로 붙인다.
 *
 * @example supabase.from("photos").select(`id, ${PHOTO_GROUP_LOCATION_COLUMNS}`)
 */
export const PHOTO_GROUP_LOCATION_COLUMNS = "group:photo_groups!photos_group_id_fkey(place, place_lat, place_lng)";

/**
 * 붙여 읽은 모음 위치를 사진의 위치 칸으로 편다. 위치는 모음마다 하나라 같은 모음의 사진은 위치가 같다.
 * 상세·지도·동선은 사진마다 위치를 읽으므로, 모음을 직접 다루기 전까지(#299) 예전 사진 행 모양을 그대로 쓴다.
 *
 * @example toPhotoWithGroupLocation({ id: "a", group: { place: "성수동", place_lat: 37.5, place_lng: 127 } })
 * // { id: "a", place: "성수동", place_lat: 37.5, place_lng: 127 }
 */
export const toPhotoWithGroupLocation = <Row extends { group: PhotoGroupLocationRow }>({
  group,
  ...photo
}: Row): Omit<Row, "group"> & PhotoGroupLocationRow => ({
  ...photo,
  place: group.place,
  place_lat: group.place_lat,
  place_lng: group.place_lng,
});
