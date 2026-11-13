import type { PlaceLocation } from "@/lib/places/location";
import type { DraftPhotoGroup, PhotoLocation } from "./form";

// 모음 위치(#298)를 견주고 고르는 도우미. "같은 곳" 판단이 두 가지인 이유:
// - 모음 위치끼리(`isSamePhotoLocation`)는 정확히 견준다. "모음 N과 같은 곳"으로 고르면 그 모음의 위치를 그대로 옮겨 오므로
//   같은 곳은 이름·좌표가 글자 그대로 같다. 사진 정보에서 읽은 위치가 조금이라도 다르면 실제로 다른 자리다.
// - 지도 가운데끼리(`isSameMapSpot`)는 허용 차이를 두고 견준다. 카카오 지도는 옮긴 좌표를 아주 조금 바꿔 돌려줄 수 있어,
//   정확히 견주면 같은 자리의 동네 이름을 다시 찾고 이름 줄이 "찾는 중"으로 돌아간다.

/** 지도 가운데가 같은 자리인지 견줄 때 허용하는 차이 */
const SAME_MAP_SPOT_DELTA = 1e-7;

/** 다른 모음의 위치. 위치 고르기 창에서 "모음 N과 같은 곳"으로 바로 고른다 */
export interface OtherGroupLocation {
  groupNumber: number;
  location: PhotoLocation;
}

/**
 * 두 모음 위치가 같은 곳인지(이름과 좌표가 모두 같은지) 정확히 견준다. 둘 다 없어도 같다.
 *
 * @example isSamePhotoLocation(group.location, other.location) // true면 "다른 모음과 같은 곳"으로 고를 필요가 없다
 */
export const isSamePhotoLocation = (left: PhotoLocation | undefined, right: PhotoLocation | undefined): boolean =>
  left?.place === right?.place && left?.lat === right?.lat && left?.lng === right?.lng;

/**
 * 지도 가운데 좌표가 같은 자리인지 허용 차이를 두고 견준다. 앞 자리가 없으면 다르다.
 *
 * @example isSameMapSpot(named, center) // false면 가운데 자리의 동네 이름을 찾는 중이다
 */
export const isSameMapSpot = (left: PlaceLocation | undefined, right: PlaceLocation): boolean =>
  left !== undefined && Math.abs(left.lat - right.lat) < SAME_MAP_SPOT_DELTA && Math.abs(left.lng - right.lng) < SAME_MAP_SPOT_DELTA;

/**
 * 위치 고르기 창에 보일 다른 모음의 위치. 같은 곳은 앞 모음 하나만 두고, 연 모음의 위치와 같은 곳은 뺀다.
 *
 * @example toOtherGroupLocations(draft.groups, "g3") // [{ groupNumber: 1, location: { place: "성동구 성수2가1동", lat, lng } }]
 */
export const toOtherGroupLocations = (groups: Pick<DraftPhotoGroup, "id" | "location">[], groupId: string | undefined): OtherGroupLocation[] => {
  const current = groups.find(({ id }) => id === groupId)?.location;
  return groups.reduce<OtherGroupLocation[]>((others, { id, location }, index) => {
    if (id === groupId || !location || isSamePhotoLocation(location, current)) return others;
    if (others.some((other) => isSamePhotoLocation(other.location, location))) return others;
    return [...others, { groupNumber: index + 1, location }];
  }, []);
};

/**
 * 위치가 없는 모음의 지도를 처음 놓을 자리: 앞 모음들 중 가장 가까운 모음의 위치, 없으면 뒤 모음들 중 가장 가까운 모음의 위치.
 *
 * @example group.location ?? findNearbyGroupLocation(draft.groups, index) // 둘 다 없으면 지도는 서울시청에서 시작한다
 */
export const findNearbyGroupLocation = (groups: Pick<DraftPhotoGroup, "location">[], index: number): PhotoLocation | undefined =>
  groups.slice(0, index).findLast(({ location }) => location)?.location ?? groups.slice(index + 1).find(({ location }) => location)?.location;
