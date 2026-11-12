import { toKstDate } from "@/lib/anniversary";
import type { PlaceLocation } from "@/lib/places/location";
import { toGroupPlaceLabel } from "./group-place";
import { getDistanceMeters, PHOTO_SPOT_RADIUS_M } from "./map-spots";
import { comparePhotoOrder, groupPhotosInOrder } from "./photo-groups";

/** 동선을 계산하는 데 쓰는 `photos` 한 행. 위치는 사진이 속한 모음의 위치다(#297) */
export interface RoutePhotoRow {
  id: string;
  group_id: string;
  sort_order: number;
  place: string;
  place_lat: number;
  place_lng: number;
  place_name: string | null;
  /** 사진 정보의 찍은 시각(#249). #249 전에 올렸거나 정보가 없던 사진은 null */
  taken_at: string | null;
}

/** 동선 위의 점 하나 = 모음 하나. 같은 곳의 모음이 이어지면 점 하나로 합치고, 좌표·이름은 그중 첫 모음 것이다 */
export interface RoutePoint extends PlaceLocation {
  /** 지도에 적는 1부터의 순서. 날이 바뀌어도 이어 센다 */
  number: number;
  /** 첫 모음을 부르는 이름: 사용자가 붙인 장소 이름, 없으면 다듬은 동 이름(#317) */
  place: string;
  photoIds: string[];
  /** 이 점이 속한 줄(`PhotoRoute.lines`)의 순서. 선 색을 고를 때 쓴다 */
  lineIndex: number;
}

/** 같은 날의 선 하나. 다음 날 줄은 전날 마지막 점에서 시작해 날 사이도 끊기지 않는다 */
export interface RouteLine {
  /** 한국 날짜 YYYY-MM-DD. 찍은 시각을 모르는 모음이 있어 날을 나누지 않으면 undefined */
  date: string | undefined;
  path: PlaceLocation[];
}

/** 기록 하나의 동선(#251, #299) */
export interface PhotoRoute {
  points: RoutePoint[];
  lines: RouteLine[];
}

interface RouteGroup {
  place: string;
  location: PlaceLocation;
  photoIds: string[];
  /** 모음 첫 사진의 찍은 시각을 한국 날짜로. 시각이 없으면 undefined */
  firstDate: string | undefined;
}

/** 사진 순서대로 모음을 묶는다. 받은 행이 정렬돼 있지 않아도 되게 여기서 다시 정렬한다 */
const toRouteGroups = (rows: RoutePhotoRow[]): RouteGroup[] =>
  groupPhotosInOrder(rows.toSorted(comparePhotoOrder)).map((photos) => {
    const [first] = photos;
    return {
      place: toGroupPlaceLabel(first),
      location: { lat: first.place_lat, lng: first.place_lng },
      photoIds: photos.map(({ id }) => id),
      firstDate: first.taken_at === null ? undefined : toKstDate(new Date(first.taken_at)),
    };
  });

/** 모든 모음의 첫 사진 날짜가 있고 모음 순서대로 줄지 않을 때만 날짜로 줄을 나눈다. 날짜가 되돌아가면 같은 날짜가 두 줄로 나뉘기 때문이다 */
const canSplitByDate = (groups: RouteGroup[]): boolean =>
  groups.every(({ firstDate }, index) => {
    const previousDate = groups[index - 1]?.firstDate ?? firstDate;
    return firstDate !== undefined && previousDate !== undefined && previousDate <= firstDate;
  });

const toPath = (points: RoutePoint[]): PlaceLocation[] => points.map(({ lat, lng }) => ({ lat, lng }));

/**
 * 기록의 사진 모음을 동선(번호 붙은 점과 날마다의 선)으로 바꾼다. 실제로 걸은 길이 아니라 모음 위치끼리의 순서다.
 * 점 하나가 모음 하나이고 모음 순서대로 잇는다(#299). 50m 안의 모음이 이어지면 점 하나로 합친다(2026-11-12 사용자 결정).
 * 모든 모음의 첫 사진에 찍은 시각이 있으면 그 한국 날짜로 줄을 나눠 선 색을 바꾸고, 하나라도 없으면 한 줄로 그린다(2026-11-12 사용자 결정).
 * 모음 순서에서 날짜가 되돌아가면(9일 → 8일 → 9일) 같은 날짜가 두 번 나오지 않게 한 줄로 그린다.
 *
 * @returns 이을 점이 둘 미만이면 undefined
 * @example buildGroupRoute(row.photos) // { points: [{ number: 1, … }, …], lines: [{ date: "2026-11-08", path: […] }] }
 */
export const buildGroupRoute = (rows: RoutePhotoRow[]): PhotoRoute | undefined => {
  const groups = toRouteGroups(rows);
  const isByDate = canSplitByDate(groups);

  const points: RoutePoint[] = [];
  const dates: (string | undefined)[] = [];
  for (const { place, location, photoIds, firstDate } of groups) {
    const date = isByDate ? firstDate : undefined;
    const previous = points.at(-1);
    const isNewDay = dates.length === 0 || dates.at(-1) !== date;
    if (previous && !isNewDay && getDistanceMeters(previous, location) <= PHOTO_SPOT_RADIUS_M) {
      previous.photoIds.push(...photoIds);
      continue;
    }
    if (isNewDay) dates.push(date);
    points.push({ number: points.length + 1, ...location, place, photoIds: [...photoIds], lineIndex: dates.length - 1 });
  }
  if (points.length < 2) return undefined;

  const lines = dates.map((date, lineIndex) => {
    const linePoints = points.filter((point) => point.lineIndex === lineIndex);
    const lastOfPreviousDay = points.findLast((point) => point.lineIndex === lineIndex - 1);
    return { date, path: toPath(lastOfPreviousDay ? [lastOfPreviousDay, ...linePoints] : linePoints) };
  });
  return { points, lines };
};
