import type { PhotoGroupLocationRow } from "@/lib/dates/photo-groups";
import { toShortRegionName } from "@/lib/places/region-name";

/** 모음 위치 칸 중 이름 두 가지: 행정동 이름(`place`)과 사용자가 붙인 장소 이름(`place_name`, #317) */
export type GroupPlaceNames = Pick<PhotoGroupLocationRow, "place" | "place_name">;

/**
 * 모음을 부르는 이름. 사용자가 붙인 장소 이름이 있으면 그것을, 없으면 행정동 이름을 다듬어(성수1가1동 → 성수동) 쓴다(#317).
 * 지도 핀의 사진 줄과 상세 동선 목록이 쓴다.
 *
 * @example toGroupPlaceLabel({ place: "성동구 성수1가1동", place_name: null }) // "성수동"
 */
export const toGroupPlaceLabel = ({ place, place_name: placeName }: GroupPlaceNames): string => {
  const name = placeName?.trim();
  return name ? name : toShortRegionName(place);
};
