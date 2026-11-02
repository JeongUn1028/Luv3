import imageCompression from "browser-image-compression";
import heic2any from "heic2any";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoError } from "./errors";
import { BUCKET_FILE_SIZE_LIMIT } from "./limits";
import { isHeic, resizePhoto } from "./resize";

// 실제 리사이즈는 브라우저 canvas가 필요해 단위 테스트에서는 라이브러리를 대신하고,
// 어떤 옵션으로 몇 번 부르는지와 결과 처리만 확인한다. 실제 크기는 브라우저 확인에서 본다.
vi.mock("browser-image-compression", () => ({ default: vi.fn() }));
vi.mock("heic2any", () => ({ default: vi.fn() }));

const compressMock = vi.mocked(imageCompression);
const heicMock = vi.mocked(heic2any);

const jpeg = (name: string, size = 10) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

beforeEach(() => {
  compressMock.mockReset();
  heicMock.mockReset();
  compressMock.mockImplementation(async (file, options) =>
    jpeg(`${options.maxWidthOrHeight}-${file.name}`),
  );
});

describe("isHeic", () => {
  it("MIME 타입이 HEIC·HEIF면 true다", () => {
    expect(isHeic(new File([], "a.heic", { type: "image/heic" }))).toBe(true);
    expect(isHeic(new File([], "a", { type: "image/heif" }))).toBe(true);
  });

  // 안드로이드 Chrome은 HEIC 파일의 MIME 타입을 비워 두는 경우가 있다
  it("MIME 타입이 비어 있으면 확장자로 판단한다", () => {
    expect(isHeic(new File([], "IMG_0001.HEIC"))).toBe(true);
    expect(isHeic(new File([], "IMG_0001.jpg"))).toBe(false);
  });

  // 일부 파일 선택기는 HEIC를 일반 바이너리(application/octet-stream)로 넘긴다
  it("MIME 타입이 octet-stream이어도 확장자로 판단한다", () => {
    expect(isHeic(new File([], "a.heic", { type: "application/octet-stream" }))).toBe(true);
  });

  it("JPEG는 false다", () => {
    expect(isHeic(jpeg("a.jpg"))).toBe(false);
  });
});

describe("resizePhoto", () => {
  it("긴 변 2000px 원본용과 긴 변 600px 썸네일을 JPEG로 만든다", async () => {
    const result = await resizePhoto(jpeg("a.jpg"));

    expect(compressMock).toHaveBeenCalledTimes(2);
    const [originalOptions, thumbOptions] = compressMock.mock.calls.map(([, options]) => options);
    expect(originalOptions).toMatchObject({ maxWidthOrHeight: 2000, fileType: "image/jpeg" });
    expect(thumbOptions).toMatchObject({ maxWidthOrHeight: 600, fileType: "image/jpeg" });
    expect(result.original).toMatchObject({ name: "2000-a.jpg" });
    expect(result.thumb).toMatchObject({ name: "600-2000-a.jpg" });
  });

  // 라이브러리는 결과가 원래 파일보다 크면 작아질 때까지 화질을 0.95배씩 최대 10번 낮춘다.
  // 이미 압축된 작은 사진이 뭉개지지 않도록 다시 낮추는 횟수를 한 번으로 묶는다.
  it("화질을 다시 낮추는 횟수를 한 번으로 제한한다", async () => {
    await resizePhoto(jpeg("a.jpg"));

    for (const [, options] of compressMock.mock.calls) {
      expect(options.maxIteration).toBe(1);
    }
  });

  // 기본값은 웹 워커가 jsdelivr CDN에서 스크립트를 받아 와, CDN이 막히면 업로드가 멈춘다
  it("외부 CDN 스크립트를 쓰는 웹 워커를 끈다", async () => {
    await resizePhoto(jpeg("a.jpg"));

    for (const [, options] of compressMock.mock.calls) {
      expect(options.useWebWorker).toBe(false);
    }
  });

  // canvas로 다시 그려 저장하므로 위치 정보(GPS) 같은 EXIF가 빠진다
  it("EXIF를 남기지 않는다", async () => {
    await resizePhoto(jpeg("a.jpg"));

    for (const [, options] of compressMock.mock.calls) {
      expect(options.preserveExif).not.toBe(true);
    }
  });

  it("썸네일은 원본 파일이 아니라 줄인 원본용 사진에서 만든다", async () => {
    await resizePhoto(jpeg("a.jpg"));

    expect(compressMock.mock.calls[1][0].name).toBe("2000-a.jpg");
  });

  it("HEIC는 JPEG로 바꾼 뒤 줄인다", async () => {
    heicMock.mockResolvedValue(new Blob([new Uint8Array(5)], { type: "image/jpeg" }));

    await resizePhoto(new File([new Uint8Array(5)], "IMG_0001.HEIC", { type: "image/heic" }));

    expect(heicMock).toHaveBeenCalledWith(expect.objectContaining({ toType: "image/jpeg" }));
    const converted = compressMock.mock.calls[0][0];
    expect(converted.type).toBe("image/jpeg");
    expect(converted.name).toBe("IMG_0001.jpg");
  });

  it("HEIC 안에 사진이 여러 장이면 첫 장을 쓴다", async () => {
    const first = new Blob([new Uint8Array(3)], { type: "image/jpeg" });
    heicMock.mockResolvedValue([first, new Blob([new Uint8Array(4)], { type: "image/jpeg" })]);

    await resizePhoto(new File([], "live.heic", { type: "image/heic" }));

    expect(compressMock.mock.calls[0][0].size).toBe(3);
  });

  it("HEIC 변환에 실패하면 사진을 열 수 없다는 에러를 낸다", async () => {
    heicMock.mockRejectedValue(new Error("ERR_LIBHEIF"));

    await expect(resizePhoto(new File([], "a.heic", { type: "image/heic" }))).rejects.toMatchObject({
      reason: "decode-failed",
    });
    expect(compressMock).not.toHaveBeenCalled();
  });

  it.each([
    ["image/png", "a.png"],
    ["image/webp", "a.webp"],
    ["", "IMG_0001.JPG"],
    ["application/octet-stream", "IMG_0001.jpeg"],
  ])("%j 형식의 %s는 줄여서 올린다", async (type, name) => {
    await expect(resizePhoto(new File([new Uint8Array(5)], name, { type }))).resolves.toBeDefined();
  });

  // SVG는 크기 정보가 없을 수 있고, GIF는 첫 장면만 남아 사진으로 다루지 않는다
  it.each([
    ["image/svg+xml", "a.svg"],
    ["image/gif", "a.gif"],
    ["application/octet-stream", "a.pdf"],
    ["", "note.txt"],
  ])("%j 형식의 %s는 거부한다", async (type, name) => {
    await expect(resizePhoto(new File([new Uint8Array(5)], name, { type }))).rejects.toMatchObject({
      reason: "unsupported-type",
    });
    expect(compressMock).not.toHaveBeenCalled();
  });

  it("사진이 아닌 파일은 줄이지 않고 거부한다", async () => {
    const promise = resizePhoto(new File(["%PDF"], "a.pdf", { type: "application/pdf" }));

    await expect(promise).rejects.toBeInstanceOf(PhotoError);
    await expect(promise).rejects.toMatchObject({ reason: "unsupported-type" });
    expect(compressMock).not.toHaveBeenCalled();
  });

  it("브라우저가 사진을 읽지 못하면 사진을 열 수 없다는 에러를 낸다", async () => {
    compressMock.mockRejectedValue(new Error("Error while loading image"));

    await expect(resizePhoto(jpeg("broken.jpg"))).rejects.toMatchObject({ reason: "decode-failed" });
  });

  // 버킷이 5MB를 넘는 파일을 거부하므로, 올리기 전에 알 수 있게 한다
  it("줄인 결과가 버킷 용량 제한을 넘으면 에러를 낸다", async () => {
    compressMock.mockResolvedValueOnce(jpeg("huge.jpg", BUCKET_FILE_SIZE_LIMIT + 1));

    await expect(resizePhoto(jpeg("a.jpg"))).rejects.toMatchObject({ reason: "too-large" });
    expect(compressMock).toHaveBeenCalledTimes(1); // 썸네일은 만들지 않는다
  });

  it("버킷 용량 제한과 같은 크기는 허용한다", async () => {
    compressMock.mockResolvedValueOnce(jpeg("limit.jpg", BUCKET_FILE_SIZE_LIMIT));

    await expect(resizePhoto(jpeg("a.jpg"))).resolves.toBeDefined();
  });
});
