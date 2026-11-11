import type { PlaceLocation } from "@/lib/places/search";

/** 사진 파일에서 읽은 정보. 읽지 못한 것은 undefined */
export interface PhotoExif {
  /** 찍은 곳의 좌표(EXIF GPS) */
  coordinates: PlaceLocation | undefined;
  /** 찍은 시각. 시간대가 붙은 ISO 문자열(`2026-11-10T14:03:22+09:00`) */
  takenAt: string | undefined;
}

/** 시간대 정보가 없는 사진은 한국에서 찍었다고 본다(#249 사용자 결정). 아이폰 카메라 사진은 시간대가 함께 있다 */
const DEFAULT_TIME_ZONE_OFFSET = "+09:00";

const EXIF_DATE_TIME = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/;
const TIME_ZONE_OFFSET = /^[+-](\d{2}):(\d{2})$/;

const isValidOffset = (offset: unknown): offset is string => {
  if (typeof offset !== "string") return false;
  const [, hours, minutes] = TIME_ZONE_OFFSET.exec(offset) ?? [];
  return hours !== undefined && minutes !== undefined && Number(hours) <= 14 && Number(minutes) < 60;
};

/**
 * EXIF의 찍은 시각(`DateTimeOriginal`)과 시간대(`OffsetTimeOriginal`)를 DB에 넣을 ISO 문자열로 바꾼다.
 * 시간대가 없거나 잘못됐으면 한국 시각으로 본다. 날짜가 비었거나(`0000:00:00 …`) 없는 날이면 undefined.
 *
 * @example toTakenAt("2026:11:10 14:03:22", "+09:00") // "2026-11-10T14:03:22+09:00"
 */
export const toTakenAt = (dateTimeOriginal: unknown, offset: unknown): string | undefined => {
  if (typeof dateTimeOriginal !== "string") return undefined;
  const [, year, month, day, hours, minutes, seconds] = EXIF_DATE_TIME.exec(dateTimeOriginal.trim()) ?? [];
  if (year === undefined || month === undefined || day === undefined || hours === undefined || minutes === undefined || seconds === undefined) {
    return undefined;
  }
  // 2월 30일처럼 없는 날은 Date가 다음 달로 넘겨 버리므로, 되돌려 같은지 본다
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), Number(seconds)));
  const isRealTime =
    Number(year) >= 1900 &&
    parsed.getUTCMonth() === Number(month) - 1 &&
    parsed.getUTCDate() === Number(day) &&
    parsed.getUTCHours() === Number(hours) &&
    parsed.getUTCMinutes() === Number(minutes) &&
    parsed.getUTCSeconds() === Number(seconds);
  if (!isRealTime) return undefined;
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${isValidOffset(offset) ? offset : DEFAULT_TIME_ZONE_OFFSET}`;
};

const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/**
 * EXIF에서 계산한 위도·경도를 좌표로 받는다. 범위를 벗어나면 DB 제약에 걸리므로 버린다.
 * 위치를 못 잡은 카메라는 0,0을 남기므로 그것도 없는 것으로 본다.
 *
 * @example toPhotoCoordinates(37.5444, 127.0396) // { lat: 37.5444, lng: 127.0396 }
 */
export const toPhotoCoordinates = (latitude: unknown, longitude: unknown): PlaceLocation | undefined => {
  if (!isFiniteNumber(latitude) || !isFiniteNumber(longitude)) return undefined;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return undefined;
  if (latitude === 0 && longitude === 0) return undefined;
  return { lat: latitude, lng: longitude };
};

// 필요한 칸만 읽는다. lite 묶음은 전체 pick 옵션에서 오류가 나 블록마다 고른다(exifr 7.1.3).
// IFD0은 Exif·GPS 블록의 위치를 담고 있어 끌 수 없다
const EXIF_OPTIONS = {
  ifd1: false,
  interop: false,
  xmp: false,
  icc: false,
  exif: { pick: ["DateTimeOriginal", "OffsetTimeOriginal"] },
  gps: { pick: ["GPSLatitude", "GPSLatitudeRef", "GPSLongitude", "GPSLongitudeRef"] },
  // 날짜를 Date로 바꾸면 브라우저 시간대로 읽혀 시간대 정보가 사라진다. 글자 그대로 받는다
  reviveValues: false,
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

const NO_EXIF: PhotoExif = { coordinates: undefined, takenAt: undefined };

/**
 * 고른 사진 파일에서 찍은 곳과 찍은 시각을 읽는다. 줄이거나 HEIC를 바꾸면 정보가 사라지므로 고른 원본에서 읽는다.
 * 사진 정보가 없거나 읽지 못해도 사진은 올릴 수 있어야 하므로 실패를 던지지 않고 빈 값을 돌려준다.
 *
 * @example const { coordinates, takenAt } = await readPhotoExif(file)
 */
export const readPhotoExif = async (file: Blob): Promise<PhotoExif> => {
  try {
    // 기록 폼에서 사진을 고를 때만 필요해 그때 불러온다. lite는 JPEG·HEIC만 읽고 Worker·외부 주소를 쓰지 않는다
    const exifr = await import("exifr/dist/lite.esm.mjs");
    const output: unknown = await exifr.parse(file, EXIF_OPTIONS);
    if (!isRecord(output)) return NO_EXIF;
    return {
      coordinates: toPhotoCoordinates(output.latitude, output.longitude),
      takenAt: toTakenAt(output.DateTimeOriginal, output.OffsetTimeOriginal),
    };
  } catch {
    // PNG·WebP처럼 lite가 모르는 형식이나 깨진 정보는 정보 없는 사진으로 둔다
    return NO_EXIF;
  }
};
