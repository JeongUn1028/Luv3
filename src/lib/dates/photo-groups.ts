/** 사진 행에 붙여 읽는 사진 모음의 위치 칸(`photo_groups`, #297)과 사용자가 붙인 장소 이름(#317) */
export interface PhotoGroupLocationRow {
  place: string;
  place_lat: number;
  place_lng: number;
  /** 사용자가 붙인 장소 이름. 없으면 null이고 화면은 행정동 이름을 다듬어 보여 준다(toGroupPlaceLabel) */
  place_name: string | null;
}

/**
 * 사진 행과 함께 읽을 모음 위치. 사진에서 모음으로 가는 외래 키를 짚어 PostgREST가 한 행으로 붙인다.
 *
 * @example supabase.from("photos").select(`id, ${PHOTO_GROUP_LOCATION_COLUMNS}`)
 */
export const PHOTO_GROUP_LOCATION_COLUMNS = "group:photo_groups!photos_group_id_fkey(place, place_lat, place_lng, place_name)";

/**
 * 붙여 읽은 모음 위치를 사진의 위치 칸으로 편다. 위치는 모음마다 하나라 같은 모음의 사진은 위치가 같다.
 * 상세·지도·동선은 사진 행에 펴진 모음 위치와 `group_id`로 모음을 다시 묶는다(#299).
 *
 * @example toPhotoWithGroupLocation({ id: "a", group: { place: "성수동", place_lat: 37.5, place_lng: 127, place_name: null } })
 * // { id: "a", place: "성수동", place_lat: 37.5, place_lng: 127, place_name: null }
 */
export const toPhotoWithGroupLocation = <Row extends { group: PhotoGroupLocationRow }>({
  group,
  ...photo
}: Row): Omit<Row, "group"> & PhotoGroupLocationRow => ({
  ...photo,
  place: group.place,
  place_lat: group.place_lat,
  place_lng: group.place_lng,
  place_name: group.place_name,
});

/**
 * 사진 순서 비교. 순서가 같으면 id로 정해 상세의 사진 순서와 동선 번호가 늘 같은 순서를 쓴다.
 *
 * @example photos.toSorted(comparePhotoOrder)
 */
export const comparePhotoOrder = (left: { sort_order: number; id: string }, right: { sort_order: number; id: string }): number =>
  left.sort_order - right.sort_order || left.id.localeCompare(right.id);

/**
 * 사진 순서대로 놓인 사진을 모음으로 묶는다. 모음 순서는 모음의 첫 사진 순서다.
 * 저장 함수는 같은 모음의 사진을 이어서 매기지만(#297), 떨어져 있어도 첫 사진 자리의 모음 하나로 모은다.
 *
 * @example groupPhotosInOrder([{ id: "a", group_id: "g1" }, { id: "b", group_id: "g2" }]) // [[{ id: "a", … }], [{ id: "b", … }]]
 */
export const groupPhotosInOrder = <Row extends { group_id: string }>(photos: Row[]): [Row, ...Row[]][] => {
  const byGroupId = new Map<string, [Row, ...Row[]]>();
  for (const photo of photos) {
    const group = byGroupId.get(photo.group_id);
    if (group) group.push(photo);
    else byGroupId.set(photo.group_id, [photo]);
  }
  return [...byGroupId.values()];
};
