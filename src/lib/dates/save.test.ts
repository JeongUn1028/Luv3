import { describe, expect, it, vi } from "vitest";
import { PhotoError } from "@/lib/photos/errors";
import type { PhotoStorage } from "@/lib/photos/upload";
import type { DateRecordDraft } from "./form";
import { SaveDateRecordError, saveDateRecord, type SaveProgress } from "./save";

const RECORD_ID = "10000000-0000-4000-8000-000000000001";
const PHOTO_A = "20000000-0000-4000-8000-00000000000a";
const PHOTO_B = "20000000-0000-4000-8000-00000000000b";

const draft: DateRecordDraft = {
  date: "2026-11-01",
  title: "첫 데이트",
  place: "성수",
  memo: "",
  photos: [
    { id: PHOTO_A, caption: "카페" },
    { id: PHOTO_B, caption: "" },
  ],
  coverPhotoId: PHOTO_A,
};
const files = new Map([
  [PHOTO_A, new File(["a"], "a.jpg", { type: "image/jpeg" })],
  [PHOTO_B, new File(["b"], "b.jpg", { type: "image/jpeg" })],
]);

/** Supabase Storage(`storage.from("album")`) 대신 쓰는 메모리 저장소 */
const createFakeStorage = () => {
  const stored = new Set<string>();
  const storage: PhotoStorage = {
    upload: vi.fn(async (path: string) => {
      stored.add(path);
      return { error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      paths.forEach((path) => stored.delete(path));
      return { error: null };
    }),
  };
  return { storage, stored };
};

const resize = vi.fn(async () => ({ original: new Blob(["o"]), thumb: new Blob(["t"]) }));

describe("saveDateRecord", () => {
  it("사진을 줄여 올린 뒤 기록을 저장하고, 단계마다 진행 상황을 알린다", async () => {
    const { storage, stored } = createFakeStorage();
    const createRecord = vi.fn(async () => ({ error: null }));
    const progress: SaveProgress[] = [];

    await saveDateRecord({
      recordId: RECORD_ID,
      draft,
      files,
      storage,
      resize,
      createRecord,
      onProgress: (step) => progress.push(step),
    });

    expect(stored.size).toBe(4);
    expect(createRecord).toHaveBeenCalledWith(
      expect.objectContaining({ p_id: RECORD_ID, p_cover_photo_id: PHOTO_A }),
    );
    expect(progress).toEqual([
      { step: "resizing", done: 0, total: 2 },
      { step: "resizing", done: 1, total: 2 },
      { step: "uploading", done: 0, total: 2 },
      { step: "uploading", done: 1, total: 2 },
      { step: "uploading", done: 2, total: 2 },
      { step: "saving", done: 2, total: 2 },
    ]);
  });

  it("기록 저장이 실패하면 올린 사진을 지우고 다시 시도하라고 알린다", async () => {
    const { storage, stored } = createFakeStorage();
    const createRecord = vi.fn(async () => ({ error: { message: "rls" } }));

    await expect(
      saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord }),
    ).rejects.toThrow(SaveDateRecordError);
    expect(stored.size).toBe(0);
  });

  it("사진을 줄이지 못하면 아무것도 올리지 않고 사진 에러를 그대로 알린다", async () => {
    const { storage } = createFakeStorage();
    const createRecord = vi.fn(async () => ({ error: null }));
    const failingResize = vi.fn(async () => {
      throw new PhotoError("decode-failed");
    });

    await expect(
      saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize: failingResize, createRecord }),
    ).rejects.toThrow("사진을 열 수 없어요");
    expect(storage.upload).not.toHaveBeenCalled();
    expect(createRecord).not.toHaveBeenCalled();
  });

  it("고른 사진의 파일이 없으면 코드 실수라 에러를 낸다", async () => {
    const { storage } = createFakeStorage();
    await expect(
      saveDateRecord({ recordId: RECORD_ID, draft, files: new Map(), storage, resize, createRecord: vi.fn() }),
    ).rejects.toThrow("파일");
  });
});
