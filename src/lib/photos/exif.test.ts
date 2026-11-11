import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildHeicWithExif, withJpegExif } from "@/test-utils/exif-image";
import { readPhotoExif, toPhotoCoordinates, toTakenAt } from "./exif";

// exifr는 브라우저의 FileReader로 파일을 조금씩 읽는다. Node에는 없어 같은 일을 하는 최소한만 둔다
class FileReaderStub {
  result: ArrayBuffer | undefined;
  onloadend: (() => void) | undefined;
  onerror: ((error: unknown) => void) | undefined;

  readAsArrayBuffer(blob: Blob): void {
    blob.arrayBuffer().then(
      (buffer) => {
        this.result = buffer;
        this.onloadend?.();
      },
      (error: unknown) => this.onerror?.(error),
    );
  }
}

const SEONGSU = { lat: 37.5444, lng: 127.0396 };

describe("toTakenAt", () => {
  it("시간대가 있으면 그 시간대를 붙인다", () => {
    expect(toTakenAt("2026:11:10 14:03:22", "-05:00")).toBe("2026-11-10T14:03:22-05:00");
  });

  it("시간대가 없거나 잘못됐으면 한국 시각으로 본다", () => {
    expect(toTakenAt("2026:11:10 14:03:22", undefined)).toBe("2026-11-10T14:03:22+09:00");
    expect(toTakenAt("2026:11:10 14:03:22", "+9")).toBe("2026-11-10T14:03:22+09:00");
    expect(toTakenAt("2026:11:10 14:03:22", "+25:00")).toBe("2026-11-10T14:03:22+09:00");
  });

  it("비어 있거나 없는 날짜면 undefined를 돌려준다", () => {
    expect(toTakenAt("0000:00:00 00:00:00", "+09:00")).toBeUndefined();
    expect(toTakenAt("2026:02:30 10:00:00", "+09:00")).toBeUndefined();
    expect(toTakenAt("2026:11:10 24:00:00", "+09:00")).toBeUndefined();
    expect(toTakenAt("    :  :     :  :  ", "+09:00")).toBeUndefined();
    expect(toTakenAt(new Date(), "+09:00")).toBeUndefined();
  });
});

describe("toPhotoCoordinates", () => {
  it("범위 안의 좌표를 돌려준다", () => {
    expect(toPhotoCoordinates(-33.8568, 151.2153)).toEqual({ lat: -33.8568, lng: 151.2153 });
  });

  it("0,0은 위치를 못 잡은 값이라 없는 것으로 본다", () => {
    expect(toPhotoCoordinates(0, 0)).toBeUndefined();
  });

  it("범위를 벗어나거나 숫자가 아니면 버린다", () => {
    expect(toPhotoCoordinates(91, 127)).toBeUndefined();
    expect(toPhotoCoordinates(37, 181)).toBeUndefined();
    expect(toPhotoCoordinates(Number.NaN, 127)).toBeUndefined();
    expect(toPhotoCoordinates("37.5", 127)).toBeUndefined();
    expect(toPhotoCoordinates(37.5, undefined)).toBeUndefined();
  });
});

describe("readPhotoExif", () => {
  beforeEach(() => {
    vi.stubGlobal("FileReader", FileReaderStub);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("JPEG에서 찍은 곳과 찍은 시각을 읽는다", async () => {
    // Arrange
    const file = new File([withJpegExif({ ...SEONGSU, dateTimeOriginal: "2026:11:10 14:03:22", offsetTimeOriginal: "+09:00" })], "a.jpg", {
      type: "image/jpeg",
    });

    // Act
    const exif = await readPhotoExif(file);

    // Assert
    expect(exif.takenAt).toBe("2026-11-10T14:03:22+09:00");
    expect(exif.coordinates?.lat).toBeCloseTo(SEONGSU.lat, 5);
    expect(exif.coordinates?.lng).toBeCloseTo(SEONGSU.lng, 5);
  });

  it("아이폰 HEIC 원본에서도 읽고, 남위·서경은 음수로 읽는다", async () => {
    // Arrange
    const file = new File([buildHeicWithExif({ lat: -22.9519, lng: -43.2105, dateTimeOriginal: "2026:01:02 09:00:00" })], "IMG_0001.HEIC", {
      type: "image/heic",
    });

    // Act
    const exif = await readPhotoExif(file);

    // Assert
    expect(exif.takenAt).toBe("2026-01-02T09:00:00+09:00");
    expect(exif.coordinates?.lat).toBeCloseTo(-22.9519, 5);
    expect(exif.coordinates?.lng).toBeCloseTo(-43.2105, 5);
  });

  it("사진 정보가 없으면 둘 다 비운다", async () => {
    // Arrange
    const file = new File([withJpegExif({})], "a.jpg", { type: "image/jpeg" });

    // Act & Assert
    await expect(readPhotoExif(file)).resolves.toEqual({ coordinates: undefined, takenAt: undefined });
  });

  it("시각만 있으면 시각만 읽는다", async () => {
    // Arrange
    const file = new File([withJpegExif({ dateTimeOriginal: "2026:11:10 14:03:22" })], "a.jpg", { type: "image/jpeg" });

    // Act & Assert
    await expect(readPhotoExif(file)).resolves.toEqual({ coordinates: undefined, takenAt: "2026-11-10T14:03:22+09:00" });
  });

  it("읽지 못하는 파일이면 던지지 않고 빈 값을 돌려준다", async () => {
    // Arrange
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], "a.png", { type: "image/png" });

    // Act & Assert
    await expect(readPhotoExif(file)).resolves.toEqual({ coordinates: undefined, takenAt: undefined });
  });
});
