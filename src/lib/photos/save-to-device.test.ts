import { describe, expect, it, vi } from "vitest";
import { fetchPhotoFile, savePhotoToDevice, type SaveTarget } from "./save-to-device";

const photo = new File(["jpeg"], "luv3-2026-11-10-p1.jpg", { type: "image/jpeg" });

const target = (overrides: Partial<SaveTarget>): SaveTarget => ({
  canShare: () => true,
  share: vi.fn(async () => undefined),
  download: vi.fn(),
  ...overrides,
});

describe("savePhotoToDevice", () => {
  it("파일 공유를 지원하면 공유 창을 열고 내려받지 않는다", async () => {
    // Arrange
    const shareTarget = target({});

    // Act
    const outcome = await savePhotoToDevice(photo, shareTarget);

    // Assert
    expect(outcome).toBe("shared");
    expect(shareTarget.share).toHaveBeenCalledWith({ files: [photo] });
    expect(shareTarget.download).not.toHaveBeenCalled();
  });

  it("파일 공유를 지원하지 않으면 내려받는다", async () => {
    const downloadTarget = target({ canShare: () => false });

    const outcome = await savePhotoToDevice(photo, downloadTarget);

    expect(outcome).toBe("downloaded");
    expect(downloadTarget.share).not.toHaveBeenCalled();
    expect(downloadTarget.download).toHaveBeenCalledWith(photo);
  });

  it("공유 기능이 아예 없는 브라우저면 내려받는다", async () => {
    const downloadTarget = target({ canShare: undefined, share: undefined });

    await expect(savePhotoToDevice(photo, downloadTarget)).resolves.toBe("downloaded");
    expect(downloadTarget.download).toHaveBeenCalledWith(photo);
  });

  it("공유 창을 닫으면 내려받지 않고 취소로 끝낸다", async () => {
    const cancelTarget = target({ share: vi.fn(async () => Promise.reject(new DOMException("닫음", "AbortError"))) });

    await expect(savePhotoToDevice(photo, cancelTarget)).resolves.toBe("cancelled");
    expect(cancelTarget.download).not.toHaveBeenCalled();
  });

  it("브라우저가 공유를 허락하지 않으면 내려받는다", async () => {
    const blockedTarget = target({ share: vi.fn(async () => Promise.reject(new DOMException("막힘", "NotAllowedError"))) });

    await expect(savePhotoToDevice(photo, blockedTarget)).resolves.toBe("downloaded");
    expect(blockedTarget.download).toHaveBeenCalledWith(photo);
  });

  it("그 밖의 공유 오류는 그대로 알린다", async () => {
    const failure = new DOMException("실패", "DataError");
    const failingTarget = target({ share: vi.fn(async () => Promise.reject(failure)) });

    await expect(savePhotoToDevice(photo, failingTarget)).rejects.toBe(failure);
    expect(failingTarget.download).not.toHaveBeenCalled();
  });
});

describe("fetchPhotoFile", () => {
  it("받은 사진을 정한 파일 이름과 받은 형식의 파일로 만든다", async () => {
    // Arrange
    const fetchPhoto = vi.fn(async () => new Response(new Blob(["png"], { type: "image/png" })));

    // Act
    const file = await fetchPhotoFile({ url: "https://signed/original", fileName: "luv3-p1.png", fetchPhoto });

    // Assert
    expect(fetchPhoto).toHaveBeenCalledWith("https://signed/original");
    expect(file).toMatchObject({ name: "luv3-p1.png", type: "image/png" });
    await expect(file.text()).resolves.toBe("png");
  });

  it("형식을 알 수 없으면 JPEG로 본다", async () => {
    const fetchPhoto = async () => new Response(new Blob(["jpeg"]));

    const file = await fetchPhotoFile({ url: "https://signed/original", fileName: "luv3-p1.jpg", fetchPhoto });

    expect(file.type).toBe("image/jpeg");
  });

  it("사진을 받지 못하면(만료된 주소 등) 오류를 낸다", async () => {
    const fetchPhoto = async () => new Response("expired", { status: 400 });

    await expect(fetchPhotoFile({ url: "https://signed/expired", fileName: "luv3-p1.jpg", fetchPhoto })).rejects.toThrow("사진을 받지 못했어요");
  });
});
