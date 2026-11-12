import { toPhotoSpots, type MapPhotoRow, type MapPhotoSpot } from "./map-spots";

/** 기록 지도 화면 주소 */
export const RECORDS_MAP_PATH = "/records/map";

/** 지도에 그릴 핀. 위치는 사진에만 있어(기록 장소 칸은 #296에서 없앴다) 사진 핀만 그린다 */
export interface MapPins {
  photoSpots: MapPhotoSpot[];
}

/**
 * 끝까지 읽은 사진 행으로 지도의 핀을 만든다.
 *
 * @example buildMapPins({ photos }) // { photoSpots: [...] }
 */
export const buildMapPins = ({ photos }: { photos: MapPhotoRow[] }): MapPins => ({ photoSpots: toPhotoSpots(photos) });

/**
 * 지도에 그릴 내용을 나타내는 글자. 다시 불러와도 이 값이 같으면 핀을 다시 그리지 않아 보던 자리가 움직이지 않는다.
 *
 * @example if (toMapPinsSignature(pins) !== drawnSignature) redraw()
 */
export const toMapPinsSignature = ({ photoSpots }: MapPins): string =>
  JSON.stringify(photoSpots.map(({ key, place, photoIds }) => [key, place, photoIds]));
