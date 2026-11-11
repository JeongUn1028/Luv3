import { describe, expect, it, vi } from "vitest";
import { PlaceRegionError } from "@/lib/places/region";
import type { PhotoExif } from "./exif";
import { readPhotoInfo } from "./photo-info";

const SEONGSU = { lat: 37.5444, lng: 127.0396 };
const TAKEN_AT = "2026-11-10T14:03:22+09:00";
const file = new Blob();

const exifWith = (exif: PhotoExif) => vi.fn<(file: Blob) => Promise<PhotoExif>>().mockResolvedValue(exif);

describe("readPhotoInfo", () => {
  it("좌표에 동네 이름을 붙이고 찍은 시각을 함께 돌려준다", async () => {
    // Arrange
    const fetchRegionName = vi.fn().mockResolvedValue("성동구 성수1가1동");

    // Act
    const info = await readPhotoInfo({ file, readExif: exifWith({ coordinates: SEONGSU, takenAt: TAKEN_AT }), fetchRegionName });

    // Assert
    expect(info).toEqual({ location: { place: "성동구 성수1가1동", ...SEONGSU }, takenAt: TAKEN_AT });
    expect(fetchRegionName).toHaveBeenCalledWith(SEONGSU);
  });

  it("국내가 아니라 이름이 없으면 좌표를 '찍은 곳'으로 지킨다", async () => {
    // Act
    const info = await readPhotoInfo({ file, readExif: exifWith({ coordinates: SEONGSU, takenAt: undefined }), fetchRegionName: vi.fn().mockResolvedValue(undefined) });

    // Assert
    expect(info.location).toEqual({ place: "찍은 곳", ...SEONGSU });
  });

  it("이름을 받지 못해도 좌표를 '찍은 곳'으로 지킨다", async () => {
    // Act
    const info = await readPhotoInfo({
      file,
      readExif: exifWith({ coordinates: SEONGSU, takenAt: TAKEN_AT }),
      fetchRegionName: vi.fn().mockRejectedValue(new PlaceRegionError({ status: 500 })),
    });

    // Assert
    expect(info).toEqual({ location: { place: "찍은 곳", ...SEONGSU }, takenAt: TAKEN_AT });
  });

  it("좌표가 없으면 이름을 받으러 가지 않고 시각만 돌려준다", async () => {
    // Arrange
    const fetchRegionName = vi.fn();

    // Act
    const info = await readPhotoInfo({ file, readExif: exifWith({ coordinates: undefined, takenAt: TAKEN_AT }), fetchRegionName });

    // Assert
    expect(info).toEqual({ location: undefined, takenAt: TAKEN_AT });
    expect(fetchRegionName).not.toHaveBeenCalled();
  });

  it("사진 정보를 읽다 실패해도 던지지 않는다", async () => {
    // Act & Assert
    await expect(readPhotoInfo({ file, readExif: vi.fn().mockRejectedValue(new Error("깨짐")) })).resolves.toEqual({
      location: undefined,
      takenAt: undefined,
    });
  });
});
