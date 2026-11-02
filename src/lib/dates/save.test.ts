import { describe, expect, it, vi } from "vitest";
import { PhotoError } from "@/lib/photos/errors";
import type { PhotoStorage } from "@/lib/photos/upload";
import type { DateRecordDraft } from "./form";
import { SaveDateRecordError, saveDateRecord, updateDateRecord, type SaveProgress } from "./save";

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

describe("updateDateRecord", () => {
  // 기존 사진 A는 그대로 두고, 새로 고른 사진 C만 파일이 있다
  const PHOTO_C = "20000000-0000-4000-8000-00000000000c";
  const editedDraft: DateRecordDraft = {
    ...draft,
    photos: [
      { id: PHOTO_C, caption: "새 사진" },
      { id: PHOTO_A, caption: "카페" },
    ],
    coverPhotoId: PHOTO_C,
  };
  const newFiles = new Map([[PHOTO_C, new File(["c"], "c.jpg", { type: "image/jpeg" })]]);
  const removedPaths = [`${RECORD_ID}/${PHOTO_B}.jpg`, `${RECORD_ID}/${PHOTO_B}_thumb.jpg`];

  it("새로 고른 사진만 줄여 올리고, 기록을 고친 뒤 뺀 사진의 파일을 지운다", async () => {
    const { storage, stored } = createFakeStorage();
    removedPaths.forEach((path) => stored.add(path));
    const updateRecord = vi.fn(async () => ({ data: removedPaths, error: null }));
    const progress: SaveProgress[] = [];

    await updateDateRecord({
      recordId: RECORD_ID,
      draft: editedDraft,
      files: newFiles,
      storage,
      resize,
      updateRecord,
      onProgress: (step) => progress.push(step),
    });

    expect([...stored].sort()).toEqual([`${RECORD_ID}/${PHOTO_C}.jpg`, `${RECORD_ID}/${PHOTO_C}_thumb.jpg`]);
    expect(updateRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        p_id: RECORD_ID,
        p_photos: [
          { id: PHOTO_C, caption: "새 사진" },
          { id: PHOTO_A, caption: "카페" },
        ],
        p_cover_photo_id: PHOTO_C,
      }),
    );
    expect(progress.at(0)).toEqual({ step: "resizing", done: 0, total: 1 });
    expect(progress.at(-1)).toEqual({ step: "saving", done: 1, total: 1 });
  });

  it("새 사진이 없으면 올리지 않고 바로 기록을 고친다", async () => {
    const { storage } = createFakeStorage();
    const updateRecord = vi.fn(async () => ({ data: [], error: null }));
    const progress: SaveProgress[] = [];

    await updateDateRecord({
      recordId: RECORD_ID,
      draft: { ...draft, photos: [{ id: PHOTO_A, caption: "" }], coverPhotoId: PHOTO_A },
      files: new Map(),
      storage,
      resize,
      updateRecord,
      onProgress: (step) => progress.push(step),
    });

    expect(storage.upload).not.toHaveBeenCalled();
    expect(storage.remove).not.toHaveBeenCalled();
    expect(progress).toEqual([{ step: "saving", done: 0, total: 0 }]);
  });

  it("기록을 고치지 못하면 새로 올린 사진만 지우고 다시 시도하라고 알린다", async () => {
    const { storage, stored } = createFakeStorage();
    removedPaths.forEach((path) => stored.add(path));
    const updateRecord = vi.fn(async () => ({ data: null, error: { message: "rls" } }));

    await expect(
      updateDateRecord({ recordId: RECORD_ID, draft: editedDraft, files: newFiles, storage, resize, updateRecord }),
    ).rejects.toThrow(SaveDateRecordError);
    // 기존 사진 파일은 그대로 둔다(기록이 바뀌지 않았으므로)
    expect([...stored].sort()).toEqual([...removedPaths].sort());
  });

  it("뺀 사진 파일을 지우지 못해도 수정은 성공으로 본다(남은 파일은 #31에서 정리)", async () => {
    const { storage } = createFakeStorage();
    vi.mocked(storage.remove).mockResolvedValueOnce({ error: { message: "network" } });
    const updateRecord = vi.fn(async () => ({ data: removedPaths, error: null }));

    await expect(
      updateDateRecord({ recordId: RECORD_ID, draft: editedDraft, files: newFiles, storage, resize, updateRecord }),
    ).resolves.toBeUndefined();
  });
});
