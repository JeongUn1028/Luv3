import { describe, expect, it, vi } from "vitest";
import { PhotoError } from "./errors";
import { toPhotoError, uploadPhotoFile, type PhotoStorage } from "./upload-file";

const PATH = "couple/30000000-0000-4000-8000-000000000001.jpg";
const body = new Blob([new Uint8Array(1)], { type: "image/jpeg" });

/** 올리기 요청마다 차례로 정해 둔 결과를 돌려주는 저장소. 다 쓰면 성공한다 */
const createStorage = (results: { error: { message: string; status?: number; statusCode?: string } | null }[]) => {
  const remaining = [...results];
  const storage: PhotoStorage = {
    upload: vi.fn(async () => remaining.shift() ?? { error: null }),
    remove: vi.fn(async () => ({ error: null })),
  };
  return storage;
};

describe("uploadPhotoFile", () => {
  it("한 번 실패하면 한 번 더 보내 올린다", async () => {
    // Arrange
    const storage = createStorage([{ error: { message: "network error" } }]);

    // Act
    await uploadPhotoFile({ storage, path: PATH, body });

    // Assert
    expect(storage.upload).toHaveBeenCalledTimes(2);
  });

  it("다시 보냈을 때 이미 있다고 하면 첫 요청이 저장된 것으로 본다", async () => {
    const storage = createStorage([{ error: { message: "network error" } }, { error: { message: "Duplicate", status: 400, statusCode: "409" } }]);

    await expect(uploadPhotoFile({ storage, path: PATH, body })).resolves.toBeUndefined();
  });

  it("처음부터 이미 있다고 하면 다른 파일을 덮지 않도록 실패시킨다", async () => {
    const storage = createStorage([{ error: { message: "Duplicate", status: 400, statusCode: "409" } }]);

    await expect(uploadPhotoFile({ storage, path: PATH, body })).rejects.toThrow(PhotoError);
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it("앞선 저장 시도가 올렸을 수 있으면 처음부터 이미 있어도 성공으로 본다", async () => {
    const storage = createStorage([{ error: { message: "Duplicate", status: 400, statusCode: "409" } }]);

    await expect(uploadPhotoFile({ storage, path: PATH, body, mayAlreadyExist: true })).resolves.toBeUndefined();
  });

  it("두 번 다 실패하면 올리지 못했다고 알리고 파일은 지우지 않는다", async () => {
    const storage = createStorage([{ error: { message: "network error" } }, { error: { message: "network error" } }]);

    await expect(uploadPhotoFile({ storage, path: PATH, body })).rejects.toMatchObject({ reason: "upload-failed" });
    expect(storage.remove).not.toHaveBeenCalled();
  });
});

describe("toPhotoError", () => {
  it("버킷 용량 제한(413)이면 너무 크다고, 아니면 올리지 못했다고 알린다", () => {
    expect([
      toPhotoError({ message: "too big", status: 400, statusCode: "413" }).reason,
      toPhotoError({ message: "too big", status: 413 }).reason,
      toPhotoError(new TypeError("Failed to fetch")).reason,
    ]).toEqual(["too-large", "too-large", "upload-failed"]);
  });
});
