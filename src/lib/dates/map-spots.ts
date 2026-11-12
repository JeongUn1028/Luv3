import type { PlaceLocation } from "@/lib/places/location";
import { toGroupPlaceLabel } from "./group-place";

/** 이 거리(m) 안의 사진은 같은 자리로 묶는다. 같은 카페 안에서도 사진마다 GPS가 몇 m씩 달라서다(#249) */
export const PHOTO_SPOT_RADIUS_M = 50;

/** 지도의 사진 핀 하나 = 가까운 모음들의 사진(#249, #299). 모음은 위치가 하나라 모음이 핀 사이로 나뉘지 않는다 */
export interface MapPhotoSpot extends PlaceLocation {
  /** 대표 사진 id. 핀을 다시 그릴지 가를 때도 쓴다 */
  key: string;
  /** 대표 사진 모음을 부르는 이름: 사용자가 붙인 장소 이름, 없으면 다듬은 동 이름(#317) */
  place: string;
  /** 최근 기록부터, 같은 기록 안에서는 사진 순서대로. 첫 사진이 핀에 보이는 대표 사진이다 */
  photoIds: string[];
}

/** `photos` 조회 결과 한 행. 위치는 사진이 속한 모음의 위치다(#297) */
export interface MapPhotoRow {
  id: string;
  date_id: string;
  sort_order: number;
  place: string;
  place_lat: number;
  place_lng: number;
  place_name: string | null;
  record: { date: string; created_at: string };
}

const EARTH_RADIUS_M = 6_371_000;
/**
 * 찾을 칸의 크기(도). 경도 1도는 위도 60도에서 약 55.6km라, 0.0009도면 그 안쪽 어디서든 칸 하나가 50m보다 넓다.
 * 그래서 이웃 9칸만 보면 50m 안의 자리를 모두 찾는다. 더 북쪽에서는 이웃 칸 밖의 가까운 사진이 따로 핀이 될 수 있다
 */
const CELL_SIZE_DEGREES = 0.0009;

const toRadians = (degrees: number): number => (degrees * Math.PI) / 180;

/**
 * 두 좌표 사이의 거리(m). 50m를 가리는 데만 쓰므로 짧은 거리에서 충분히 맞는 평면 근사를 쓴다.
 *
 * @example getDistanceMeters({ lat: 37.5444, lng: 127.0396 }, { lat: 37.5448, lng: 127.0396 }) // 약 44
 */
export const getDistanceMeters = (from: PlaceLocation, to: PlaceLocation): number => {
  const x = toRadians(to.lng - from.lng) * Math.cos(toRadians((from.lat + to.lat) / 2));
  const y = toRadians(to.lat - from.lat);
  return Math.hypot(x, y) * EARTH_RADIUS_M;
};

/**
 * 기록을 최신순(날짜 → 작성 시각)으로 줄 세우는 비교 함수. 끝까지 나눠 읽은 기록을 화면 순서로 되돌릴 때 쓴다(#272).
 *
 * @example rows.toSorted(compareNewestFirst)
 */
export const compareNewestFirst = (
  left: { id: string; date: string; created_at: string },
  right: { id: string; date: string; created_at: string },
): number =>
  right.date.localeCompare(left.date) ||
  Date.parse(right.created_at) - Date.parse(left.created_at) ||
  // DB는 마이크로초까지 저장하지만 Date.parse는 밀리초까지만 읽어, 같아 보이는 기록도 늘 같은 순서가 되게 id로 정한다
  right.id.localeCompare(left.id);

/** 기록은 최신순, 같은 기록 안에서는 사진 순서대로 */
const comparePhotosNewestFirst = (left: MapPhotoRow, right: MapPhotoRow): number =>
  compareNewestFirst({ id: left.date_id, ...left.record }, { id: right.date_id, ...right.record }) ||
  left.sort_order - right.sort_order ||
  left.id.localeCompare(right.id);

const toCell = ({ lat, lng }: PlaceLocation): [number, number] => [Math.floor(lat / CELL_SIZE_DEGREES), Math.floor(lng / CELL_SIZE_DEGREES)];

const findNearbySpot = (spotsByCell: Map<string, MapPhotoSpot[]>, location: PlaceLocation): MapPhotoSpot | undefined => {
  const [row, column] = toCell(location);
  for (let rowOffset = -1; rowOffset <= 1; rowOffset += 1) {
    for (let columnOffset = -1; columnOffset <= 1; columnOffset += 1) {
      const spot = spotsByCell
        .get(`${row + rowOffset},${column + columnOffset}`)
        ?.find((candidate) => getDistanceMeters(candidate, location) <= PHOTO_SPOT_RADIUS_M);
      if (spot) return spot;
    }
  }
  return undefined;
};

/**
 * 사진을 50m 안끼리 한 자리(핀)로 묶는다. 최근 사진부터 보며, 먼저 생긴 자리의 대표 사진 좌표에서 50m 안이면 그 자리에 넣는다.
 * 같은 모음의 사진은 위치가 같아 늘 한 핀에 모이고, 다른 기록의 모음도 50m 안이면 합친다(#299).
 * 사진 순서는 모음 순서대로 매겨져 있어(#297) 대표 사진은 그 자리에서 가장 최근 기록의 앞 모음 첫 사진이고, 핀도 그 좌표에 꽂힌다.
 *
 * @example toPhotoSpots(rows) // [{ key: "p1", lat: 37.5444, lng: 127.0396, place: "성수동", photoIds: ["p1", "p2"] }]
 */
export const toPhotoSpots = (rows: MapPhotoRow[]): MapPhotoSpot[] => {
  const spots: MapPhotoSpot[] = [];
  const spotsByCell = new Map<string, MapPhotoSpot[]>();
  for (const row of rows.toSorted(comparePhotosNewestFirst)) {
    const { id, place_lat: lat, place_lng: lng } = row;
    const location = { lat, lng };
    const nearbySpot = findNearbySpot(spotsByCell, location);
    if (nearbySpot) {
      nearbySpot.photoIds.push(id);
      continue;
    }
    const spot = { key: id, lat, lng, place: toGroupPlaceLabel(row), photoIds: [id] };
    spots.push(spot);
    const cellKey = toCell(location).join(",");
    spotsByCell.set(cellKey, [...(spotsByCell.get(cellKey) ?? []), spot]);
  }
  return spots;
};
