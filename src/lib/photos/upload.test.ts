import { describe, expect, it, vi } from "vitest";
import { PhotoError } from "./errors";
import { removeUploadedPhotos, resizeAndUploadPhotos, UPLOAD_CONCURRENCY, type PhotoStorage } from "./upload";

const DATE_ID = "10000000-0000-4000-8000-000000000001";
const PHOTO_A = "20000000-0000-4000-8000-00000000000a";
const PHOTO_B = "20000000-0000-4000-8000-00000000000b";
const PHOTO_C = "20000000-0000-4000-8000-00000000000c";
const PHOTO_D = "20000000-0000-4000-8000-00000000000d";

const blob = () => new Blob([new Uint8Array(1)], { type: "image/jpeg" });
const photo = (photoId: string) => ({ photoId, file: new File([new Uint8Array(1)], `${photoId}.jpg`, { type: "image/jpeg" }) });
/** 줄이기 대신 1바이트 원본·썸네일을 바로 돌려준다 */
const fakeResize = async () => ({ original: blob(), thumb: blob() });

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

/** 앞서 걸어 둔 비동기 작업(줄이기, 다음 올리기)이 모두 돌게 한 번 쉰다 */
const flushTasks = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/**
 * 가짜 저장소의 올리기를 테스트가 풀어 줄 때까지 붙잡는다. `only`가 있으면 그 경로만 붙잡는다.
 * 붙잡은 요청은 풀면 원래 가짜 저장소대로 처리된다
 */
const createHeldUploads = (storage: PhotoStorage, { only }: { only?: string[] } = {}) => {
  const original = vi.mocked(storage.upload).getMockImplementation();
  if (!original) throw new Error("가짜 저장소의 올리기가 없다");
  const pending = new Map<string, () => void>();
  vi.mocked(storage.upload).mockImplementation(async (path, body, options) => {
    if (!only || only.includes(path)) await new Promise<void>((resolve) => pending.set(path, resolve));
    return original(path, body, options);
  });
  const release = (path: string) => {
    const resolve = pending.get(path);
    if (!resolve) throw new Error(`붙잡은 올리기가 없다: ${path}`);
    pending.delete(path);
    resolve();
  };
  return {
    pendingPaths: () => [...pending.keys()],
    release,
    /** 지금 붙잡은 것과 앞으로 올 요청을 모두 바로 보낸다 */
    releaseAll: () => {
      vi.mocked(storage.upload).mockImplementation(original);
      [...pending.keys()].forEach(release);
    },
  };
};

describe("resizeAndUploadPhotos", () => {
  it("사진마다 원본과 썸네일을 정해진 경로에 올리고 경로를 돌려준다", async () => {
    const { storage, files } = createFakeStorage();

    const uploaded = await resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

    expect(uploaded).toEqual([
      { photoId: PHOTO_A, path: `${DATE_ID}/${PHOTO_A}.jpg`, thumbPath: `${DATE_ID}/${PHOTO_A}_thumb.jpg` },
      { photoId: PHOTO_B, path: `${DATE_ID}/${PHOTO_B}.jpg`, thumbPath: `${DATE_ID}/${PHOTO_B}_thumb.jpg` },
    ]);
    expect([...files.keys()]).toHaveLength(4);
  });

  // 같은 경로에 덮어쓰면 다른 기록의 사진을 지울 수 있다
  it("JPEG로 올리고 이미 있는 파일은 덮어쓰지 않는다", async () => {
    const { storage } = createFakeStorage();

    await resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] });

    expect(storage.upload).toHaveBeenCalledWith(
      `${DATE_ID}/${PHOTO_A}.jpg`,
      expect.any(Blob),
      expect.objectContaining({ contentType: "image/jpeg", upsert: false }),
    );
  });

  // 올린 파일은 덮어쓰지 않아 같은 경로면 늘 같은 사진이므로 기본값(1시간)보다 오래 저장해 두게 한다(#218).
  // 지운 사진도 이 시간 동안은 CDN이 보내 줄 수 있어 7일을 넘기지 않는다
  it("올린 사진은 휴대폰과 CDN이 7일 동안 저장해 두게 한다", async () => {
    const { storage } = createFakeStorage();

    await resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] });

    expect(storage.upload).toHaveBeenCalledWith(expect.any(String), expect.any(Blob), expect.objectContaining({ cacheControl: "604800" }));
  });

  it("사진 한 장을 올릴 때마다 진행 상황을 알린다", async () => {
    const { storage } = createFakeStorage();
    const onProgress = vi.fn();

    await resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A), photo(PHOTO_B)], onProgress });

    expect(onProgress.mock.calls).toEqual([
      [1, 2],
      [2, 2],
    ]);
  });

  it("업로드가 한 번 실패하면 다시 시도해 이어서 올린다", async () => {
    const { storage, files } = createFakeStorage({ failures: { [`${DATE_ID}/${PHOTO_B}.jpg`]: 1 } });

    await resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

    expect(files.has(`${DATE_ID}/${PHOTO_B}.jpg`)).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("다시 시도해도 실패하면 이번에 올린 파일을 모두 지우고 에러를 낸다", async () => {
    const { storage, files } = createFakeStorage({ failures: { [`${DATE_ID}/${PHOTO_B}_thumb.jpg`]: Infinity } });

    const promise = resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

    await expect(promise).rejects.toBeInstanceOf(PhotoError);
    await expect(promise).rejects.toMatchObject({ reason: "upload-failed" });
    expect(storage.upload).toHaveBeenCalledTimes(5); // A 원본·썸네일, B 원본, B 썸네일 2번
    // 두 장을 함께 올려 시도한 순서는 정해져 있지 않다
    expect(vi.mocked(storage.remove).mock.calls[0]?.[0].toSorted()).toEqual([
      `${DATE_ID}/${PHOTO_A}.jpg`,
      `${DATE_ID}/${PHOTO_A}_thumb.jpg`,
      `${DATE_ID}/${PHOTO_B}.jpg`,
      `${DATE_ID}/${PHOTO_B}_thumb.jpg`,
    ]);
    expect(files.size).toBe(0);
  });

  it("한 장을 줄이면 다음 장을 줄이기 전에 그 사진을 올리기 시작한다", async () => {
    const { storage } = createFakeStorage();
    const events: string[] = [];
    vi.mocked(storage.upload).mockImplementation(async (path) => {
      events.push(`올리기 ${path.slice(DATE_ID.length + 1)}`);
      return { error: null };
    });
    const resize = async (file: File) => {
      events.push(`줄이기 ${file.name}`);
      return fakeResize();
    };

    await resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

    expect(events.slice(0, 3)).toEqual([`줄이기 ${PHOTO_A}.jpg`, `올리기 ${PHOTO_A}.jpg`, `줄이기 ${PHOTO_B}.jpg`]);
  });

  // 줄인 사진을 모두 메모리에 쌓아 두면 사진이 많을 때 아이폰이 화면을 다시 불러온다(#312)
  it(`동시에 ${UPLOAD_CONCURRENCY}장까지만 올리고, 한 장을 다 올려야 다음 장을 줄인다`, async () => {
    const { storage } = createFakeStorage();
    const held = createHeldUploads(storage);
    const resize = vi.fn(fakeResize);
    const photos = ["a", "b", "c", "d", "e"].map((suffix) => photo(`20000000-0000-4000-8000-00000000000${suffix}`));

    const promise = resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize, photos });
    await flushTasks();

    // Assert: 세 장을 줄여 원본을 올리는 중이고, 넷째 장은 아직 줄이지 않았다
    expect(resize).toHaveBeenCalledTimes(UPLOAD_CONCURRENCY);
    expect(held.pendingPaths()).toHaveLength(UPLOAD_CONCURRENCY);

    // Act: 첫 장의 원본과 썸네일을 다 올린다
    held.release(`${DATE_ID}/${photos[0]?.photoId}.jpg`);
    await flushTasks();
    held.release(`${DATE_ID}/${photos[0]?.photoId}_thumb.jpg`);
    await flushTasks();

    // Assert: 자리가 하나 비어 넷째 장을 줄인다
    expect(resize).toHaveBeenCalledTimes(UPLOAD_CONCURRENCY + 1);

    held.releaseAll();
    await expect(promise).resolves.toHaveLength(photos.length);
  });

  it("올린 사진은 올린 순서와 상관없이 고른 순서대로 돌려준다", async () => {
    const { storage } = createFakeStorage();
    const held = createHeldUploads(storage);

    const promise = resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A), photo(PHOTO_B)] });
    await flushTasks();
    held.release(`${DATE_ID}/${PHOTO_B}.jpg`);
    await flushTasks();
    held.release(`${DATE_ID}/${PHOTO_B}_thumb.jpg`);
    await flushTasks();
    held.releaseAll();

    expect((await promise).map(({ photoId }) => photoId)).toEqual([PHOTO_A, PHOTO_B]);
  });

  // 고르기 전에 걸렀어도 HEIC를 읽지 못하는 등 줄이기는 중간에 실패할 수 있고, 그때는 이미 올린 사진이 있다
  it("줄이기에 실패하면 앞서 올린 사진을 지우고 줄이기 에러를 그대로 낸다", async () => {
    const { storage, files } = createFakeStorage();
    const resize = vi.fn(fakeResize).mockResolvedValueOnce({ original: blob(), thumb: blob() }).mockRejectedValueOnce(new PhotoError("decode-failed"));

    const promise = resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize, photos: [photo(PHOTO_A), photo(PHOTO_B), photo(PHOTO_C)] });

    await expect(promise).rejects.toMatchObject({ reason: "decode-failed" });
    expect(resize).toHaveBeenCalledTimes(2);
    // A의 원본을 올리는 사이 B 줄이기가 실패해 A의 썸네일은 올리지 않는다
    expect(storage.remove).toHaveBeenCalledWith([`${DATE_ID}/${PHOTO_A}.jpg`]);
    expect(files.size).toBe(0);
  });

  // 올리던 파일보다 먼저 지우면, 지운 뒤에 그 파일이 올라가 주인 없는 파일로 남는다
  it("한 장이 실패하면 더 줄이지 않고, 올리던 사진이 끝난 뒤에 이번에 올린 파일을 함께 지운다", async () => {
    const { storage, files } = createFakeStorage({ failures: { [`${DATE_ID}/${PHOTO_B}.jpg`]: Infinity } });
    const held = createHeldUploads(storage, { only: [`${DATE_ID}/${PHOTO_A}.jpg`] });
    const resize = vi.fn(fakeResize);

    const promise = resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize, photos: [photo(PHOTO_A), photo(PHOTO_B), photo(PHOTO_C), photo(PHOTO_D)] });
    const settled = promise.catch((error: unknown) => error);
    await flushTasks();

    // Assert: B가 실패해 넷째 장은 줄이지 않고, A를 올리는 동안은 지우지 않는다
    expect(resize).toHaveBeenCalledTimes(3);
    expect(storage.remove).not.toHaveBeenCalled();

    // Act
    held.release(`${DATE_ID}/${PHOTO_A}.jpg`);

    // Assert: 실패를 알린 뒤로는 A의 썸네일을 올리지 않고, 시도한 파일을 모두 지운다
    await expect(settled).resolves.toMatchObject({ reason: "upload-failed" });
    expect(storage.upload).not.toHaveBeenCalledWith(`${DATE_ID}/${PHOTO_A}_thumb.jpg`, expect.anything(), expect.anything());
    expect(vi.mocked(storage.remove).mock.calls[0]?.[0]).toEqual(expect.arrayContaining([`${DATE_ID}/${PHOTO_A}.jpg`, `${DATE_ID}/${PHOTO_B}.jpg`]));
    expect(files.size).toBe(0);
  });

  // 요청은 저장됐는데 응답만 끊긴 경우, 실패로 보이는 파일도 버킷에 남아 있을 수 있다
  it("응답을 받지 못한 파일도 남지 않도록 시도한 경로까지 지운다", async () => {
    const { storage, files } = createFakeStorage();
    vi.mocked(storage.upload).mockImplementation(async (path, body) => {
      files.set(path, body);
      return { error: { message: "Failed to fetch" } };
    });

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] })).rejects.toThrow();
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

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] })).resolves.toHaveLength(1);
    expect(files.has(`${DATE_ID}/${PHOTO_A}.jpg`)).toBe(true);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("처음 보낸 요청부터 이미 있다고 하면 다른 파일을 덮지 않도록 실패시킨다", async () => {
    const { storage } = createFakeStorage({
      failures: { [`${DATE_ID}/${PHOTO_A}.jpg`]: Infinity },
      failWith: { message: "The resource already exists", status: 400, statusCode: "409" },
    });

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] })).rejects.toMatchObject({
      reason: "upload-failed",
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it("앞선 저장 시도가 올렸을 수 있으면 처음부터 이미 있어도 성공으로 본다", async () => {
    const { storage } = createFakeStorage({
      failures: { [`${DATE_ID}/${PHOTO_A}.jpg`]: Infinity, [`${DATE_ID}/${PHOTO_A}_thumb.jpg`]: Infinity },
      failWith: { message: "The resource already exists", status: 400, statusCode: "409" },
    });

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)], mayAlreadyExist: true })).resolves.toHaveLength(1);

    expect(storage.upload).toHaveBeenCalledTimes(2);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("앞선 저장 시도가 올렸을 수 있으면 올리지 못해도 파일을 지우지 않는다", async () => {
    // 저장된 기록이 이 파일을 가리키고 있을 수 있다
    const { storage } = createFakeStorage({ failures: { [`${DATE_ID}/${PHOTO_A}.jpg`]: Infinity } });

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)], mayAlreadyExist: true })).rejects.toBeInstanceOf(PhotoError);

    expect(storage.remove).not.toHaveBeenCalled();
  });

  // id 형식 오류는 코드 실수라, 일부를 올린 뒤 "다시 시도해 주세요"로 감추지 않고 올리기 전에 드러낸다
  it("사진 id가 UUID가 아니면 아무것도 올리지 않고 에러를 그대로 낸다", async () => {
    const { storage } = createFakeStorage();

    const promise = resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A), photo("photo-2")] });

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

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] })).rejects.toMatchObject({
      reason: "too-large",
    });
    expect(storage.upload).toHaveBeenCalledTimes(1);
  });

  it("요청이 많아 거부되면(429) 다시 시도한다", async () => {
    const { storage } = createFakeStorage({
      failures: { [`${DATE_ID}/${PHOTO_A}.jpg`]: 1 },
      failWith: { message: "Too many requests", status: 429 },
    });

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] })).resolves.toHaveLength(1);
  });

  it("업로드 중 예외가 나도 실패로 처리하고 올린 파일을 지운다", async () => {
    const { storage } = createFakeStorage();
    vi.mocked(storage.upload)
      .mockResolvedValueOnce({ error: null })
      .mockRejectedValue(new TypeError("Failed to fetch"));

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] })).rejects.toMatchObject({
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

    await expect(resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A)] })).rejects.toMatchObject({
      reason: "upload-failed",
    });
  });
});

describe("removeUploadedPhotos", () => {
  it("올린 사진의 원본과 썸네일을 한 번에 지운다", async () => {
    const { storage, files } = createFakeStorage();
    const uploaded = await resizeAndUploadPhotos({ storage, dateId: DATE_ID, resize: fakeResize, photos: [photo(PHOTO_A), photo(PHOTO_B)] });

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
