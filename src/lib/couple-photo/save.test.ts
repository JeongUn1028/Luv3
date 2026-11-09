import { describe, expect, it, vi } from "vitest";
import { PhotoError } from "@/lib/photos/errors";
import type { PhotoStorage } from "@/lib/photos/upload";
import { clearCouplePhoto, CouplePhotoError, replaceCouplePhoto } from "./save";

const NEW_ID = "50000000-0000-4000-8000-000000000002";
const NEW_PATH = `couple/${NEW_ID}.jpg`;
const NEW_MEDIUM_PATH = `couple/${NEW_ID}_medium.jpg`;
const OLD_PATH = "couple/50000000-0000-4000-8000-000000000001.jpg";
const OLD_MEDIUM_PATH = "couple/50000000-0000-4000-8000-000000000001_medium.jpg";

const blob = () => new Blob([new Uint8Array(1)], { type: "image/jpeg" });

interface FakeStorageOptions {
  /** true면 올리기가 계속 실패한다 */
  isUploadFailing?: boolean;
  /** 이 경로만 올리기가 계속 실패한다 */
  failingUploadPath?: string;
  isRemoveFailing?: boolean;
}

/** Supabase Storage 대신 쓰는 메모리 저장소. 부른 순서를 `calls`에 남긴다 */
const createFakeStorage = ({ isUploadFailing = false, failingUploadPath, isRemoveFailing = false }: FakeStorageOptions = {}) => {
  const files = new Set<string>([OLD_PATH, OLD_MEDIUM_PATH]);
  const calls: string[] = [];

  const storage: PhotoStorage = {
    upload: vi.fn(async (path: string) => {
      calls.push(`upload ${path}`);
      if (isUploadFailing || path === failingUploadPath) return { error: { message: "network error" } };
      files.add(path);
      return { error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      calls.push(`remove ${paths.join(",")}`);
      if (isRemoveFailing) return { error: { message: "network error" } };
      paths.forEach((path) => files.delete(path));
      return { error: null };
    }),
  };

  return { storage, files, calls };
};

/** `supabase.rpc("set_couple_photo" | "clear_couple_photo")` 대신 쓰는 함수. 밀려난 예전 경로를 돌려준다 */
const rpcReturning = (calls: string[], data: string | null, error: { message: string } | null = null) =>
  vi.fn(async (path?: string) => {
    calls.push(path === undefined ? "clear" : `save ${path}`);
    return { data, error };
  });

describe("replaceCouplePhoto", () => {
  it("새 사진의 원본과 홈 카드용 중간 크기를 couple 폴더에 올리고 경로를 저장한 뒤, 밀려난 예전 두 파일을 지운다", async () => {
    const { storage, files, calls } = createFakeStorage();
    const savePath = rpcReturning(calls, OLD_PATH);

    await replaceCouplePhoto({ storage, photoId: NEW_ID, original: blob(), medium: blob(), savePath });

    expect(calls).toEqual([`upload ${NEW_PATH}`, `upload ${NEW_MEDIUM_PATH}`, `save ${NEW_PATH}`, `remove ${OLD_PATH},${OLD_MEDIUM_PATH}`]);
    expect([...files]).toEqual([NEW_PATH, NEW_MEDIUM_PATH]);
  });

  it("처음 올리면 지울 예전 파일이 없다", async () => {
    const { storage, calls } = createFakeStorage();

    await replaceCouplePhoto({ storage, photoId: NEW_ID, original: blob(), medium: blob(), savePath: rpcReturning(calls, null) });

    expect(storage.remove).not.toHaveBeenCalled();
  });

  // 응답이 끊겨 같은 경로를 다시 저장하면, 지금 보여 주는 파일을 지우면 안 된다
  it("돌려받은 예전 경로가 새 경로와 같으면 지우지 않는다", async () => {
    const { storage, files, calls } = createFakeStorage();

    await replaceCouplePhoto({ storage, photoId: NEW_ID, original: blob(), medium: blob(), savePath: rpcReturning(calls, NEW_PATH) });

    expect(storage.remove).not.toHaveBeenCalled();
    expect(files.has(NEW_PATH)).toBe(true);
    expect(files.has(NEW_MEDIUM_PATH)).toBe(true);
  });

  it("올리지 못하면 경로를 저장하지 않고, 올리려던 파일을 지운 뒤 화면에 보여 줄 에러를 낸다", async () => {
    const { storage, files, calls } = createFakeStorage({ isUploadFailing: true });
    const savePath = rpcReturning(calls, OLD_PATH);

    const result = replaceCouplePhoto({ storage, photoId: NEW_ID, original: blob(), medium: blob(), savePath });

    await expect(result).rejects.toThrow(PhotoError);
    expect(savePath).not.toHaveBeenCalled();
    expect(storage.remove).toHaveBeenCalledWith([NEW_PATH, NEW_MEDIUM_PATH]);
    expect([...files]).toEqual([OLD_PATH, OLD_MEDIUM_PATH]);
  });

  it("중간 크기를 올리지 못하면 경로를 저장하지 않고, 먼저 올린 원본까지 지운다", async () => {
    const { storage, files, calls } = createFakeStorage({ failingUploadPath: NEW_MEDIUM_PATH });
    const savePath = rpcReturning(calls, OLD_PATH);

    const result = replaceCouplePhoto({ storage, photoId: NEW_ID, original: blob(), medium: blob(), savePath });

    await expect(result).rejects.toThrow(PhotoError);
    expect(savePath).not.toHaveBeenCalled();
    expect([...files]).toEqual([OLD_PATH, OLD_MEDIUM_PATH]);
  });

  it("경로를 두 번 저장하지 못하면 올린 새 파일을 지우고 예전 사진은 그대로 둔다", async () => {
    const { storage, files, calls } = createFakeStorage();
    const savePath = rpcReturning(calls, null, { message: "network error" });

    const result = replaceCouplePhoto({ storage, photoId: NEW_ID, original: blob(), medium: blob(), savePath });

    await expect(result).rejects.toThrow(new CouplePhotoError("save"));
    expect(savePath).toHaveBeenCalledTimes(2);
    expect(calls.at(-1)).toBe(`remove ${NEW_PATH},${NEW_MEDIUM_PATH}`);
    expect([...files]).toEqual([OLD_PATH, OLD_MEDIUM_PATH]);
  });

  // 저장은 됐는데 응답만 끊긴 경우, 바로 새 파일을 지우면 두 사람 모두 깨진 사진을 본다.
  // 같은 경로로 다시 저장하면 DB가 null을 돌려주므로(이미 저장됨) 첫 응답의 예전 경로는 받지 못한다
  it("저장 응답이 끊기면 같은 경로로 한 번 더 저장하고, 성공하면 새 파일을 남긴다", async () => {
    const { storage, files, calls } = createFakeStorage();
    const savePath = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: { message: "Failed to fetch" } })
      .mockResolvedValueOnce({ data: null, error: null });

    await replaceCouplePhoto({ storage, photoId: NEW_ID, original: blob(), medium: blob(), savePath });

    expect(savePath).toHaveBeenNthCalledWith(2, NEW_PATH);
    expect(files.has(NEW_PATH)).toBe(true);
    expect(files.has(NEW_MEDIUM_PATH)).toBe(true);
    expect(calls.some((call) => call.startsWith("remove"))).toBe(false);
  });

  it("저장 함수가 예외를 던져도 다시 시도한 뒤 올린 새 파일을 지우고 화면에 보여 줄 에러를 낸다", async () => {
    const { storage, files } = createFakeStorage();
    const savePath = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));

    const result = replaceCouplePhoto({ storage, photoId: NEW_ID, original: blob(), medium: blob(), savePath });

    await expect(result).rejects.toThrow(new CouplePhotoError("save"));
    expect(savePath).toHaveBeenCalledTimes(2);
    expect(files.has(NEW_PATH)).toBe(false);
    expect(files.has(NEW_MEDIUM_PATH)).toBe(false);
  });

  // 사진은 이미 바뀌었으므로 실패로 알리지 않는다. 남은 파일은 #31에서 정리한다
  it("예전 파일을 지우지 못해도 바꾸기는 성공하고 onCleanupError로 알린다", async () => {
    const { storage, calls } = createFakeStorage({ isRemoveFailing: true });
    const onCleanupError = vi.fn();

    await replaceCouplePhoto({
      storage,
      photoId: NEW_ID,
      original: blob(),
      medium: blob(),
      savePath: rpcReturning(calls, OLD_PATH),
      onCleanupError,
    });

    expect(onCleanupError).toHaveBeenCalledOnce();
  });

  it("사진 id가 UUID가 아니면 아무것도 올리지 않는다", async () => {
    const { storage, calls } = createFakeStorage();

    await expect(
      replaceCouplePhoto({ storage, photoId: "../x", original: blob(), medium: blob(), savePath: rpcReturning(calls, null) }),
    ).rejects.toThrow("UUID");
    expect(storage.upload).not.toHaveBeenCalled();
  });
});

describe("clearCouplePhoto", () => {
  it("커플 사진을 비운 뒤 원본과 중간 크기 파일을 지운다", async () => {
    const { storage, files, calls } = createFakeStorage();

    await clearCouplePhoto({ storage, clearPath: rpcReturning(calls, OLD_PATH) });

    expect(calls).toEqual(["clear", `remove ${OLD_PATH},${OLD_MEDIUM_PATH}`]);
    expect(files.size).toBe(0);
  });

  it("이미 사진이 없으면 지울 파일이 없다", async () => {
    const { storage, calls } = createFakeStorage();

    await clearCouplePhoto({ storage, clearPath: rpcReturning(calls, null) });

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("비우기 함수가 예외를 던지면 파일을 그대로 두고 화면에 보여 줄 에러를 낸다", async () => {
    const { storage } = createFakeStorage();

    await expect(
      clearCouplePhoto({ storage, clearPath: vi.fn().mockRejectedValue(new TypeError("Failed to fetch")) }),
    ).rejects.toThrow(new CouplePhotoError("clear"));
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("비우지 못하면 파일을 그대로 두고 화면에 보여 줄 에러를 낸다", async () => {
    const { storage, files, calls } = createFakeStorage();

    await expect(
      clearCouplePhoto({ storage, clearPath: rpcReturning(calls, null, { message: "network error" }) }),
    ).rejects.toThrow(new CouplePhotoError("clear"));
    expect(storage.remove).not.toHaveBeenCalled();
    expect([...files]).toEqual([OLD_PATH, OLD_MEDIUM_PATH]);
  });

  it("파일을 지우지 못해도 지우기는 성공하고 onCleanupError로 알린다", async () => {
    const { storage, calls } = createFakeStorage({ isRemoveFailing: true });
    const onCleanupError = vi.fn();

    await clearCouplePhoto({ storage, clearPath: rpcReturning(calls, OLD_PATH), onCleanupError });

    expect(onCleanupError).toHaveBeenCalledOnce();
  });
});
