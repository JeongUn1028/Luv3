import type { PhotoLocation } from "@/lib/dates/form";
import { readPlaceRegionName, UNKNOWN_PHOTO_PLACE } from "@/lib/places/region";
import type { PlaceLocation } from "@/lib/places/location";
import { readPhotoExif, type PhotoExif } from "./exif";

/** 고른 사진에서 채울 값. 읽지 못한 것은 undefined */
export interface PhotoInfo {
  location: PhotoLocation | undefined;
  takenAt: string | undefined;
}

export interface ReadPhotoInfoParams {
  file: Blob;
  /** 모음 위치가 될 사진(새 모음의 첫 사진)인지. 모음 위치만 쓰므로 아니면 동네 이름을 묻지 않는다(#353) */
  isGroupLocation: boolean;
  /** 테스트에서 바꿔 끼운다 */
  readExif?: (file: Blob) => Promise<PhotoExif>;
  /** 테스트에서 바꿔 끼운다 */
  fetchRegionName?: (location: PlaceLocation) => Promise<string | undefined>;
}

/**
 * 고른 사진의 찍은 곳·찍은 시각을 읽고, 좌표에는 동네 이름을 붙인다. 이름을 받지 못하면(국내가 아님, 실패, 한도)
 * 좌표를 버리지 않고 `UNKNOWN_PHOTO_PLACE`로 두고, 실패는 기록한다. 사진은 정보 없이도 올릴 수 있어야 하므로 던지지 않는다.
 * 모음 위치가 될 사진이 아니면 위치는 돌려주지 않는다(쓰는 곳이 없어 동네 이름을 묻지 않는다).
 *
 * @example const { location, takenAt } = await readPhotoInfo({ file, isGroupLocation: true })
 */
export const readPhotoInfo = async ({
  file,
  isGroupLocation,
  readExif = readPhotoExif,
  fetchRegionName = readPlaceRegionName,
}: ReadPhotoInfoParams): Promise<PhotoInfo> => {
  const { coordinates, takenAt } = await readExif(file).catch((): PhotoExif => ({ coordinates: undefined, takenAt: undefined }));
  if (!coordinates || !isGroupLocation) return { location: undefined, takenAt };
  const name = await fetchRegionName(coordinates).catch((error: unknown) => {
    console.error("사진 동네 이름 받기 실패", error);
    return undefined;
  });
  return { location: { place: name ?? UNKNOWN_PHOTO_PLACE, ...coordinates }, takenAt };
};
