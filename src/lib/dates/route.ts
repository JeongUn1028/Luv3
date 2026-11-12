import { toKstDate } from "@/lib/anniversary";
import { UNKNOWN_PHOTO_PLACE } from "@/lib/places/region";
import type { PlaceLocation } from "@/lib/places/location";
import { getDistanceMeters, PHOTO_SPOT_RADIUS_M } from "./map-spots";

/** 동선을 계산하는 데 쓰는 `photos` 한 행 */
export interface RoutePhotoRow {
  id: string;
  sort_order: number;
  place: string | null;
  place_lat: number | null;
  place_lng: number | null;
  /** 사진 정보의 찍은 시각(#249). #249 전에 올렸거나 정보가 없던 사진은 null */
  taken_at: string | null;
}

/** 동선 위의 점 하나 = 같은 자리에서 연달아 찍은 사진들. 좌표는 그중 첫 사진 좌표다 */
export interface RoutePoint extends PlaceLocation {
  /** 지도에 적는 1부터의 순서. 날이 바뀌어도 이어 센다 */
  number: number;
  /** 첫 사진의 장소 이름 */
  place: string;
  photoIds: string[];
  /** 이 점이 속한 줄(`PhotoRoute.lines`)의 순서. 선 색을 고를 때 쓴다 */
  lineIndex: number;
}

/** 같은 날의 선 하나. 다음 날 줄은 전날 마지막 점에서 시작해 날 사이도 끊기지 않는다 */
export interface RouteLine {
  /** 한국 날짜 YYYY-MM-DD. 앨범 순서로 이어 날짜를 모르면 undefined */
  date: string | undefined;
  path: PlaceLocation[];
}

/** 기록 하나의 동선(#251) */
export interface PhotoRoute {
  /** 찍은 시각 순서로 이었는지, 앨범의 사진 순서로 이었는지 */
  order: "takenAt" | "album";
  points: RoutePoint[];
  lines: RouteLine[];
}

interface LocatedPhoto {
  id: string;
  sortOrder: number;
  place: string;
  location: PlaceLocation;
  takenAt: string | null;
}

const toLocatedPhotos = (rows: RoutePhotoRow[]): LocatedPhoto[] =>
  rows.flatMap(({ id, sort_order: sortOrder, place, place_lat: lat, place_lng: lng, taken_at: takenAt }) =>
    lat !== null && lng !== null ? [{ id, sortOrder, place: place ?? UNKNOWN_PHOTO_PLACE, location: { lat, lng }, takenAt }] : [],
  );

const compareAlbumOrder = (left: LocatedPhoto, right: LocatedPhoto): number => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id);

const compareTakenAt = (left: LocatedPhoto, right: LocatedPhoto): number =>
  Date.parse(left.takenAt ?? "") - Date.parse(right.takenAt ?? "") || compareAlbumOrder(left, right);

const toPath = (points: RoutePoint[]): PlaceLocation[] => points.map(({ lat, lng }) => ({ lat, lng }));

/**
 * 기록의 사진을 동선(번호 붙은 점과 날마다의 선)으로 바꾼다. 실제로 걸은 길이 아니라 찍은 곳끼리의 순서다.
 * 위치가 있는 사진이 모두 찍은 시각을 가지면 시각 순서로, 하나라도 없으면 앨범 순서(`sort_order`)로 잇는다(#251 사용자 결정).
 * 시각 순서면 한국 날짜로 줄을 나눈다. 같은 날 50m 안에서 연달아 찍은 사진은 점 하나로 합친다.
 *
 * @returns 이을 점이 둘 미만이면 undefined
 * @example buildPhotoRoute(row.photos) // { order: "takenAt", points: [{ number: 1, … }, …], lines: [{ date: "2026-11-08", path: […] }] }
 */
export const buildPhotoRoute = (rows: RoutePhotoRow[]): PhotoRoute | undefined => {
  const photos = toLocatedPhotos(rows);
  const order = photos.length > 0 && photos.every(({ takenAt }) => takenAt !== null) ? "takenAt" : "album";
  const sorted = photos.toSorted(order === "takenAt" ? compareTakenAt : compareAlbumOrder);

  const points: RoutePoint[] = [];
  const dates: (string | undefined)[] = [];
  for (const { id, place, location, takenAt } of sorted) {
    const date = order === "takenAt" && takenAt !== null ? toKstDate(new Date(takenAt)) : undefined;
    const previous = points.at(-1);
    const isNewDay = dates.length === 0 || dates.at(-1) !== date;
    if (previous && !isNewDay && getDistanceMeters(previous, location) <= PHOTO_SPOT_RADIUS_M) {
      previous.photoIds.push(id);
      continue;
    }
    if (isNewDay) dates.push(date);
    points.push({ number: points.length + 1, ...location, place, photoIds: [id], lineIndex: dates.length - 1 });
  }
  if (points.length < 2) return undefined;

  const lines = dates.map((date, lineIndex) => {
    const linePoints = points.filter((point) => point.lineIndex === lineIndex);
    const lastOfPreviousDay = points.findLast((point) => point.lineIndex === lineIndex - 1);
    return { date, path: toPath(lastOfPreviousDay ? [lastOfPreviousDay, ...linePoints] : linePoints) };
  });
  return { order, points, lines };
};
