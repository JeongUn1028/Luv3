import { describe, expect, it, vi } from "vitest";
import { PhotoError } from "./errors";
import { removeUploadedPhotos, uploadPhotos, type PhotoStorage } from "./upload";

const DATE_ID = "10000000-0000-4000-8000-000000000001";
const PHOTO_A = "20000000-0000-4000-8000-00000000000a";
const PHOTO_B = "20000000-0000-4000-8000-00000000000b";

const blob = () => new Blob([new Uint8Array(1)], { type: "image/jpeg" });
const photo = (photoId: string) => ({ photoId, original: blob(), thumb: blob() });

interface FakeStorageOptions {
  /** 경로별로 실패시킬 횟수. Infinity면 계속 실패한다 */
  failures?: Record<string, number>;
  /** 실패할 때 돌려줄 에러. Storage는 HTTP 400에 본문 statusCode로 실제 이유를 담는다 */
  failWith?: { message: string; status?: number; statusCode?: string };
  removeError?: { message: string };
}

/** Supabase Storage(`storage.from("album")`) 대신 쓰는 메모리 저장소 */
const createFakeStorage = ({ failures = {}, failWith, removeError }: FakeStorageOptions = {}) => {
  const files = new Map<string, Blob>();
  const remaining = { ...failures };

  const storage: PhotoStorage = {
    upload: vi.fn(async (path: string, body: Blob) => {
      if ((remaining[path] ?? 0) > 0) {
        remaining[path] -= 1;
        return { error: failWith ?? { message: "network error" } };
      }
      files.set(path, body);
      return { error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      if (removeError) return { error: removeError };
      paths.forEach((path) => files.delete(path));
      return { error: null };
    }),
  };

  return { storage, files };
};

describe("uploadPhotos", () => {
  it("사진마다 원본과 썸네일을 정해진 경로에 올리고 경로를 돌려준다", async () => {
    const { storage, files } = createFakeStorage();

    const uploaded = await uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

    expect(uploaded).toEqual([
      { photoId: PHOTO_A, path: `${DATE_ID}/${PHOTO_A}.jpg`, thumbPath: `${DATE_ID}/${PHOTO_A}_thumb.jpg` },
      { photoId: PHOTO_B, path: `${DATE_ID}/${PHOTO_B}.jpg`, thumbPath: `${DATE_ID}/${PHOTO_B}_thumb.jpg` },
    ]);
    expect([...files.keys()]).toHaveLength(4);
  });

  // 같은 경로에 덮어쓰면 다른 기록의 사진을 지울 수 있다
  it("JPEG로 올리고 이미 있는 파일은 덮어쓰지 않는다", async () => {
    const { storage } = createFakeStorage();

    await uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A)] });

    expect(storage.upload).toHaveBeenCalledWith(
      `${DATE_ID}/${PHOTO_A}.jpg`,
      expect.any(Blob),
      expect.objectContaining({ contentType: "image/jpeg", upsert: false }),
    );
  });

  it("사진 한 장을 올릴 때마다 진행 상황을 알린다", async () => {
    const { storage } = createFakeStorage();
    const onProgress = vi.fn();

    await uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A), photo(PHOTO_B)], onProgress });

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("업로드가 한 번 실패하면 다시 시도해 이어서 올린다", async () => {
    const { storage, files } = createFakeStorage({ failures: { [`${DATE_ID}/${PHOTO_B}.jpg`]: 1 } });

    await uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

    expect(files.has(`${DATE_ID}/${PHOTO_B}.jpg`)).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("다시 시도해도 실패하면 이번에 올린 파일을 모두 지우고 에러를 낸다", async () => {
    const { storage, files } = createFakeStorage({ failures: { [`${DATE_ID}/${PHOTO_B}_thumb.jpg`]: Infinity } });

    const promise = uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

    await expect(promise).rejects.toBeInstanceOf(PhotoError);
    await expect(promise).rejects.toMatchObject({ reason: "upload-failed" });
    expect(storage.upload).toHaveBeenCalledTimes(5); // A 원본·썸네일, B 원본, B 썸네일 2번
    expect(storage.remove).toHaveBeenCalledWith([
      `${DATE_ID}/${PHOTO_A}.jpg`,
      `${DATE_ID}/${PHOTO_A}_thumb.jpg`,
      `${DATE_ID}/${PHOTO_B}.jpg`,
      `${DATE_ID}/${PHOTO_B}_thumb.jpg`,
    ]);
    expect(files.size).toBe(0);
  });

  // 요청은 저장됐는데 응답만 끊긴 경우, 실패로 보이는 파일도 버킷에 남아 있을 수 있다
  it("응답을 받지 못한 파일도 남지 않도록 시도한 경로까지 지운다", async () => {
    const { storage, files } = createFakeStorage();
    vi.mocked(storage.upload).mockImplementation(async (path, body) => {
      files.set(path, body);
      return { error: { message: "Failed to fetch" } };
    });

    await expect(uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A)] })).rejects.toThrow();
    expect(storage.remove).toHaveBeenCalledWith([`${DATE_ID}/${PHOTO_A}.jpg`]);
    expect(files.size).toBe(0);
  });

  // 사진 id는 새로 만든 UUID라, 다시 보냈을 때의 중복은 첫 요청이 이미 저장됐다는 뜻이다
  it("다시 보냈더니 이미 있다고 하면 첫 요청이 저장된 것으로 보고 이어서 올린다", async () => {
    const { storage, files } = createFakeStorage();
    const duplicate = { message: "The resource already exists", status: 400, statusCode: "409" };
    vi.mocked(storage.upload)
      .mockImplementationOnce(async (path, body) => {
        files.set(path, body);
        return { error: { message: "Failed to fetch" } };
      })
      .mockResolvedValueOnce({ error: duplicate });

    await expect(uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A)] })).resolves.toHaveLength(1);
    expect(files.has(`${DATE_ID}/${PHOTO_A}.jpg`)).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("처음 보낸 요청부터 이미 있다고 하면 다른 파일을 덮지 않도록 실패시킨다", async () => {
    const { storage } = createFakeStorage({
      failures: { [`${DATE_ID}/${PHOTO_A}.jpg`]: Infinity },
      failWith: { message: "The resource already exists", status: 400, statusCode: "409" },
    });

    await expect(uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A)] })).rejects.toMatchObject({
      reason: "upload-failed",
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  // id 형식 오류는 코드 실수라, 일부를 올린 뒤 "다시 시도해 주세요"로 감추지 않고 올리기 전에 드러낸다
  it("사진 id가 UUID가 아니면 아무것도 올리지 않고 에러를 그대로 낸다", async () => {
    const { storage } = createFakeStorage();

    const promise = uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A), photo("photo-2")] });

    await expect(promise).rejects.toThrow("UUID");
    await expect(promise).rejects.not.toBeInstanceOf(PhotoError);
    expect(storage.upload).not.toHaveBeenCalled();
  });

  // 형식·용량 제한(4xx)은 다시 보내도 같은 결과라 바로 실패시킨다
  it("버킷이 용량 제한으로 거부하면 다시 시도하지 않고 너무 크다고 알린다", async () => {
    const { storage } = createFakeStorage({
      failures: { [`${DATE_ID}/${PHOTO_A}.jpg`]: Infinity },
      failWith: { message: "The object exceeded the maximum allowed size", status: 400, statusCode: "413" },
    });

    await expect(uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A)] })).rejects.toMatchObject({
      reason: "too-large",
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it("요청이 많아 거부되면(429) 다시 시도한다", async () => {
    const { storage } = createFakeStorage({
      failures: { [`${DATE_ID}/${PHOTO_A}.jpg`]: 1 },
      failWith: { message: "Too many requests", status: 429 },
    });

    await expect(uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A)] })).resolves.toHaveLength(1);
  });

  it("업로드 중 예외가 나도 실패로 처리하고 올린 파일을 지운다", async () => {
    const { storage } = createFakeStorage();
    vi.mocked(storage.upload)
      .mockResolvedValueOnce({ error: null })
      .mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A)] })).rejects.toMatchObject({
      reason: "upload-failed",
    });
    expect(storage.remove).toHaveBeenCalledWith([`${DATE_ID}/${PHOTO_A}.jpg`, `${DATE_ID}/${PHOTO_A}_thumb.jpg`]);
  });

  // 정리에 실패해도 사용자에게는 원래 실패 이유(업로드 실패)를 알려야 한다
  it("올린 파일 정리에 실패해도 업로드 실패 에러를 낸다", async () => {
    const { storage } = createFakeStorage({
      failures: { [`${DATE_ID}/${PHOTO_A}_thumb.jpg`]: Infinity },
      removeError: { message: "remove failed" },
    });

    await expect(uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A)] })).rejects.toMatchObject({
      reason: "upload-failed",
    });
  });
});

describe("removeUploadedPhotos", () => {
  it("올린 사진의 원본과 썸네일을 한 번에 지운다", async () => {
    const { storage, files } = createFakeStorage();
    const uploaded = await uploadPhotos({ storage, dateId: DATE_ID, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

    await removeUploadedPhotos(storage, uploaded);

    expect(storage.remove).toHaveBeenCalledTimes(1);
    expect(files.size).toBe(0);
  });

  it("지울 사진이 없으면 삭제를 요청하지 않는다", async () => {
    const { storage } = createFakeStorage();

    await removeUploadedPhotos(storage, []);

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("삭제에 실패하면 에러를 낸다", async () => {
    const { storage } = createFakeStorage({ removeError: { message: "remove failed" } });
    const uploaded = [{ photoId: PHOTO_A, path: "a.jpg", thumbPath: "a_thumb.jpg" }];

    await expect(removeUploadedPhotos(storage, uploaded)).rejects.toThrow("remove failed");
  });
});
