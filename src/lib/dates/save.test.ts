import { describe, expect, it, vi } from "vitest";
import { PhotoError } from "@/lib/photos/errors";
import type { PhotoStorage } from "@/lib/photos/upload";
import type { DateRecordDraft } from "./form";
import {
  DateRecordAlreadyLinkedError,
  DateRecordConflictError,
  DateRecordGoneError,
  SaveDateRecordError,
  saveDateRecord,
  updateDateRecord,
  type SaveProgress,
} from "./save";

const RECORD_ID = "10000000-0000-4000-8000-000000000001";
const PHOTO_A = "20000000-0000-4000-8000-00000000000a";
const PHOTO_B = "20000000-0000-4000-8000-00000000000b";
// 모음마다 위치가 있어야 저장할 수 있다(#297)
const ONION = { place: "어니언 성수", lat: 37.5447, lng: 127.0582 };
const GROUP_ID = "30000000-0000-4000-8000-000000000001";
/** 저장된 위치가 있는 모음 하나 */
const group = (photos: DateRecordDraft["groups"][number]["photos"]): DateRecordDraft["groups"][number] => ({
  id: GROUP_ID,
  location: ONION,
  locationSource: "saved",
  pendingLocationPhotoId: undefined,
  placeName: "",
  caption: "",
  photos,
});

const draft: DateRecordDraft = {
  date: "2026-11-01",
  endDate: undefined,
  title: "첫 데이트",
  memo: "",
  tags: [],
  groups: [
    { ...group([{ id: PHOTO_A }, { id: PHOTO_B }]), caption: "카페" },
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

const LOST_RESPONSE = { message: "TypeError: Failed to fetch", code: "" };
const REJECTED = { message: "rls", code: "42501" };
const DUPLICATE = { message: "duplicate key", code: "23505" };

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
    const createRecord = vi.fn(async () => ({ error: { message: "rls", code: "42501" } }));

    await expect(
      saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord }),
    ).rejects.toThrow(SaveDateRecordError);
    expect(stored.size).toBe(0);
  });

  it("응답만 끊기면 올린 사진을 지우지 않고 한 번 더 보내 저장한다", async () => {
    const { storage, stored } = createFakeStorage();
    const createRecord = vi
      .fn<() => Promise<{ error: { message: string; code?: string } | null }>>()
      .mockResolvedValueOnce({ error: LOST_RESPONSE })
      .mockResolvedValueOnce({ error: null });

    await saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord });

    expect(createRecord).toHaveBeenCalledTimes(2);
    expect(stored.size).toBe(4);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("다시 보내도 응답이 없으면 저장됐을 수 있다고 알리고 사진을 남긴다", async () => {
    const { storage, stored } = createFakeStorage();
    const createRecord = vi.fn(async () => ({ error: LOST_RESPONSE }));

    const failure = saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord });

    await expect(failure).rejects.toMatchObject({ name: "SaveDateRecordError", mayHaveSaved: true, message: expect.stringContaining("확인하지 못했어요") });
    expect(stored.size).toBe(4);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it.each(["504", "PGRST000", "PGRST003", "08006", "57P01"])("연결 오류 %s도 저장됐을 수 있는 것으로 본다", async (code) => {
    const { storage, stored } = createFakeStorage();
    const createRecord = vi.fn(async () => ({ error: { message: "connection", code } }));

    await expect(saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord })).rejects.toMatchObject({ mayHaveSaved: true });

    expect(stored.size).toBe(4);
  });

  it("첫 요청의 결과를 모르면 두 번째가 거절돼도 사진을 지우지 않는다", async () => {
    const { storage, stored } = createFakeStorage();
    const createRecord = vi
      .fn<() => Promise<{ error: { message: string; code?: string } | null }>>()
      .mockResolvedValueOnce({ error: LOST_RESPONSE })
      .mockResolvedValueOnce({ error: { message: "connection pool", code: "PGRST003" } });

    await expect(saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord })).rejects.toMatchObject({ mayHaveSaved: true });

    expect(stored.size).toBe(4);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("첫 응답을 잃고 다시 보냈더니 이미 있으면 저장된 것으로 끝낸다", async () => {
    const { storage, stored } = createFakeStorage();
    const createRecord = vi
      .fn<() => Promise<{ error: { message: string; code?: string } | null }>>()
      .mockResolvedValueOnce({ error: LOST_RESPONSE })
      .mockResolvedValueOnce({ error: DUPLICATE });

    await expect(saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord })).resolves.toBe("already-saved");

    expect(stored.size).toBe(4);
  });

  it("앞선 시도가 저장했을 수 있는데 이미 있으면 덮어쓰지 않고 저장된 것으로 끝낸다", async () => {
    const { storage } = createFakeStorage();
    const createRecord = vi.fn(async () => ({ error: DUPLICATE }));

    await expect(saveDateRecord({ recordId: RECORD_ID, draft: { ...draft, uncertainSaveRecordId: RECORD_ID }, files, storage, resize, createRecord })).resolves.toBe(
      "already-saved",
    );

    expect(createRecord).toHaveBeenCalledTimes(1);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("앞선 시도가 저장했을 수 있으면 분명히 거절돼도 사진을 지우지 않는다", async () => {
    const { storage } = createFakeStorage();
    const createRecord = vi.fn(async () => ({ error: REJECTED }));

    await expect(saveDateRecord({ recordId: RECORD_ID, draft: { ...draft, uncertainSaveRecordId: RECORD_ID }, files, storage, resize, createRecord })).rejects.toMatchObject({
      mayHaveSaved: true,
    });

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("처음 저장인데 같은 id가 있으면 저장된 것으로 넘기지 않는다", async () => {
    const { storage } = createFakeStorage();
    const createRecord = vi.fn(async () => ({ error: DUPLICATE }));

    await expect(saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord })).rejects.toMatchObject({ mayHaveSaved: false });

    expect(storage.remove).toHaveBeenCalled();
  });

  it("그 일정의 그날에 이미 기록이 있으면 올린 사진을 지우고 이미 남긴 기록을 알린다", async () => {
    const { storage, stored } = createFakeStorage();
    const linkedId = "10000000-0000-4000-8000-0000000000ff";
    const createRecord = vi.fn(async () => ({ error: { message: "이미 기록이 있습니다", code: "P0410", details: linkedId } }));

    const saving = saveDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, createRecord });

    await expect(saving).rejects.toThrow(DateRecordAlreadyLinkedError);
    await expect(saving).rejects.toMatchObject({ recordId: linkedId, mayHaveSaved: false });
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
    groups: [
      { ...group([{ id: PHOTO_C }, { id: PHOTO_A }]), caption: "새 사진과 카페" },
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
        p_groups: [
          {
            id: GROUP_ID,
            location: ONION,
            place_name: "",
            caption: "새 사진과 카페",
            photos: [{ id: PHOTO_C }, { id: PHOTO_A }],
          },
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
      draft: { ...draft, groups: [group([{ id: PHOTO_A }])], coverPhotoId: PHOTO_A },
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
    const updateRecord = vi.fn(async () => ({ data: null, error: { message: "rls", code: "42501" } }));

    await expect(
      updateDateRecord({ recordId: RECORD_ID, draft: editedDraft, files: newFiles, storage, resize, updateRecord }),
    ).rejects.toThrow(SaveDateRecordError);
    // 기존 사진 파일은 그대로 둔다(기록이 바뀌지 않았으므로)
    expect([...stored].sort()).toEqual([...removedPaths].sort());
  });

  it("상대가 이미 지운 기록이면 새로 올린 사진을 지우고 다시 시도하라고 하지 않는다", async () => {
    const { storage, stored } = createFakeStorage();
    const updateRecord = vi.fn(async () => ({ data: null, error: { message: "기록을 찾을 수 없습니다", code: "P0002" } }));

    const save = updateDateRecord({ recordId: RECORD_ID, draft: editedDraft, files: newFiles, storage, resize, updateRecord });

    await expect(save).rejects.toThrow(DateRecordGoneError);
    await expect(save).rejects.toThrow("이미 지워졌어요");
    expect([...stored]).toEqual([]);
  });

  it("응답만 끊기면 새 사진을 지우지 않고 한 번 더 보내 고친다", async () => {
    const { storage, stored } = createFakeStorage();
    const updateRecord = vi
      .fn<() => Promise<{ data: string[] | null; error: { message: string; code?: string } | null }>>()
      .mockResolvedValueOnce({ data: null, error: LOST_RESPONSE })
      .mockResolvedValueOnce({ data: [], error: null });

    await updateDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, updateRecord });

    expect(updateRecord).toHaveBeenCalledTimes(2);
    expect(stored.size).toBe(4);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("다시 보내도 응답이 없으면 고쳐졌을 수 있다고 알리고 새 사진을 남긴다", async () => {
    const { storage, stored } = createFakeStorage();
    const updateRecord = vi.fn(async () => ({ data: null, error: LOST_RESPONSE }));

    await expect(updateDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, updateRecord })).rejects.toMatchObject({ mayHaveSaved: true });

    expect(stored.size).toBe(4);
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("앞선 시도가 고쳤을 수 있으면 분명히 거절돼도 사진을 지우지 않는다", async () => {
    const { storage } = createFakeStorage();
    const updateRecord = vi.fn(async () => ({ data: null, error: REJECTED }));

    await expect(updateDateRecord({ recordId: RECORD_ID, draft: { ...draft, uncertainSaveRecordId: RECORD_ID }, files, storage, resize, updateRecord })).rejects.toMatchObject({
      mayHaveSaved: true,
    });

    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("불러온 판 번호와 새 판 번호를 함께 보낸다", async () => {
    const { storage } = createFakeStorage();
    const updateRecord = vi.fn(async () => ({ data: [], error: null }));

    await updateDateRecord({
      recordId: RECORD_ID,
      draft: { ...draft, expectedRevisions: ["판-1"], nextRevision: "판-2" },
      files: new Map(),
      storage,
      resize,
      updateRecord,
    });

    expect(updateRecord).toHaveBeenCalledWith(expect.objectContaining({ p_expected_revisions: ["판-1"], p_new_revision: "판-2" }));
  });

  it("상대가 먼저 고쳤으면 새로 올린 사진을 지우고 다시 시도하라고 하지 않는다", async () => {
    const { storage, stored } = createFakeStorage();
    const updateRecord = vi.fn(async () => ({ data: null, error: { message: "화면을 연 뒤 기록이 바뀌었습니다", code: "P0409" } }));

    const failure = updateDateRecord({ recordId: RECORD_ID, draft, files, storage, resize, updateRecord });

    await expect(failure).rejects.toBeInstanceOf(DateRecordConflictError);
    await expect(failure).rejects.toMatchObject({ mayHaveSaved: false });
    expect(stored.size).toBe(0);
  });

  it("내 앞선 저장이 됐을 수 있으면 상대가 고쳤다고 해도 사진을 지우지 않는다", async () => {
    const { storage } = createFakeStorage();
    const updateRecord = vi.fn(async () => ({ data: null, error: { message: "바뀜", code: "P0409" } }));

    const failure = updateDateRecord({ recordId: RECORD_ID, draft: { ...draft, uncertainSaveRecordId: RECORD_ID }, files, storage, resize, updateRecord });

    await expect(failure).rejects.toBeInstanceOf(DateRecordConflictError);
    await expect(failure).rejects.toMatchObject({ message: expect.stringContaining("반영됐을 수 있어요") });
    expect(storage.remove).not.toHaveBeenCalled();
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
