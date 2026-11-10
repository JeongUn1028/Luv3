import type { PlaceLocation } from "@/lib/places/search";

/** 기록 지도 화면 주소 */
export const RECORDS_MAP_PATH = "/records/map";

/** 지도의 핀 목록에 보여 줄 기록 */
export interface MapRecord {
  id: string;
  title: string;
  /** YYYY-MM-DD. 기간이면 시작일 */
  date: string;
  /** 기간의 끝 날짜. 하루짜리면 undefined */
  endDate: string | undefined;
  /** 이 기록의 장소 이름. 같은 건물의 두 가게처럼 좌표가 같아도 이름은 다를 수 있다 */
  place: string;
}

/** 지도의 핀 하나 = 같은 자리의 기록들 */
export interface MapPin extends PlaceLocation {
  key: string;
  /** 가장 최근 기록의 장소 이름 */
  place: string;
  /** 받은 순서 그대로(최신순) */
  records: MapRecord[];
}

/** `dates` 조회 결과 한 행 */
export interface MapRow {
  id: string;
  title: string;
  date: string;
  end_date: string | null;
  place: string | null;
  place_lat: number | null;
  place_lng: number | null;
}

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
  right.id.localeCompare(left.id)

/** 이름은 좌표와 함께 저장되지만, 없어도 핀은 그릴 수 있게 대신 쓰는 말 */
const FALLBACK_PLACE = "이 장소";

/**
 * 기록을 핀으로 묶는다. 같은 장소를 찾아 고르면 좌표가 똑같으므로 같은 좌표끼리 한 핀이다. 좌표가 없는 기록은 뺀다.
 *
 * @example toMapPins([{ id: "1", title: "성수", date: "2026-11-01", end_date: null, place: "성수", place_lat: 37.5, place_lng: 127 }])
 */
export const toMapPins = (rows: MapRow[]): MapPin[] => {
  const pins = new Map<string, MapPin>();
  for (const { id, title, date, end_date: endDate, place, place_lat: lat, place_lng: lng } of rows) {
    if (lat === null || lng === null) continue;
    const key = `${lat},${lng}`;
    const recordPlace = place ?? FALLBACK_PLACE;
    const pin = pins.get(key) ?? { key, lat, lng, place: recordPlace, records: [] };
    pin.records.push({ id, title, date, endDate: endDate ?? undefined, place: recordPlace });
    pins.set(key, pin);
  }
  return [...pins.values()];
};

/**
 * 지도에 그릴 내용을 나타내는 글자. 다시 불러와도 이 값이 같으면 핀을 다시 그리지 않아 보던 자리가 움직이지 않는다.
 *
 * @example if (toMapPinsSignature(pins) !== drawnSignature) redraw()
 */
export const toMapPinsSignature = (pins: MapPin[]): string =>
  JSON.stringify(pins.map(({ key, place, records }) => [key, place, records.map(({ id }) => id)]));
