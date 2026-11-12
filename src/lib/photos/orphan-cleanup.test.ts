import { describe, expect, it, vi } from "vitest";
import type { AlbumListStorage } from "./album-files";
import { cleanupOrphanPhotos, shouldDeleteOrphans, type CleanupStorage, type PhotoFileReferences } from "./orphan-cleanup";

const NOW = new Date("2026-11-10T12:00:00Z");
const OLD = "2026-11-08T12:00:00Z";
const RECENT = "2026-11-10T01:00:00Z";

const DATE_ID = "10000000-0000-4000-8000-000000000001";
const uuid = (suffix: number) => `20000000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const photoPaths = (suffix: number) => ({ path: `${DATE_ID}/${uuid(suffix)}.jpg`, thumb_path: `${DATE_ID}/${uuid(suffix)}_thumb.jpg` });
const couplePath = (suffix: number) => `couple/${uuid(suffix)}.jpg`;
const coupleMediumPath = (suffix: number) => `couple/${uuid(suffix)}_medium.jpg`;

type ListItem = NonNullable<Awaited<ReturnType<AlbumListStorage["list"]>>["data"]>[number];

/** album 버킷 대신 쓰는 메모리 저장소. 경로 → 올린 시각(undefined면 시각 없음) */
const createFakeStorage = (initial: Record<string, string | undefined>, removeError?: { message: string }) => {
  const files = new Map(Object.entries(initial));

  const storage: CleanupStorage = {
    list: vi.fn(async (prefix: string) => {
      const items = new Map<string, ListItem>();
      for (const [filePath, createdAt] of files) {
        const rest = prefix ? (filePath.startsWith(`${prefix}/`) ? filePath.slice(prefix.length + 1) : undefined) : filePath;
        if (rest === undefined) continue;
        const [name, ...deeper] = rest.split("/");
        items.set(name, deeper.length > 0 ? { name, id: null } : { name, id: filePath, created_at: createdAt, metadata: { size: 1 } });
      }
      return { data: [...items.values()], error: null };
    }),
    remove: vi.fn(async (paths: string[]) => {
      if (removeError) return { error: removeError };
      paths.forEach((filePath) => files.delete(filePath));
      return { error: null };
    }),
  };

  return { storage, files };
};

const referencesOf = (references: Partial<PhotoFileReferences>) => async (): Promise<PhotoFileReferences> => ({
  photos: [],
  couplePhotoPath: undefined,
  trash: [],
  ...references,
});

const trashOf = (suffix: number, deletedAt: string) => ({ id: `trash-${suffix}`, ...photoPaths(suffix), deleted_at: deletedAt });
const noTrashDelete = async () => undefined;

describe("cleanupOrphanPhotos", () => {
  it("기록 사진·지금 커플 사진과 그 중간 크기는 남기고, 하루 지난 주인 없는 파일만 지운다", async () => {
    // Arrange
    // 지울 파일이 쓰는 파일보다 많으면 멈추므로(아래 테스트) 쓰는 사진을 넉넉히 둔다
    const kept = [photoPaths(1), photoPaths(4)];
    const orphan = photoPaths(2);
    const { storage, files } = createFakeStorage({
      ...Object.fromEntries(kept.flatMap(({ path, thumb_path }) => [[path, OLD], [thumb_path, OLD]])),
      [orphan.path]: OLD,
      [orphan.thumb_path]: OLD,
      [couplePath(10)]: OLD,
      [coupleMediumPath(10)]: OLD,
      [couplePath(11)]: OLD,
      [coupleMediumPath(11)]: OLD,
      [couplePath(12)]: OLD,
      [coupleMediumPath(12)]: OLD,
    });

    // Act
    const result = await cleanupOrphanPhotos({
      storage,
      // 파일이 없는 행(photoPaths(3))은 쓰는 파일 수에 넣지 않는다
      readReferences: referencesOf({ photos: [...kept, photoPaths(3)], couplePhotoPath: couplePath(10) }),
      now: NOW,
      deleteTrashRows: noTrashDelete,
      shouldDelete: true,
    });

    // Assert
    // 크기 합계는 지우기 전에 읽은 버킷 전체 기준이다(가짜 저장소는 파일마다 1바이트)
    expect(result).toMatchObject({
      status: "deleted",
      inUseCount: 6,
      recentOrphanCount: 0,
      unknownPaths: [],
      fileCount: 12,
      totalBytes: 12,
      unsizedCount: 0,
    });
    expect(result.orphanPaths.toSorted()).toEqual(
      [orphan.path, orphan.thumb_path, couplePath(11), coupleMediumPath(11), couplePath(12), coupleMediumPath(12)].toSorted(),
    );
    expect([...files.keys()].toSorted()).toEqual(
      [...kept.flatMap(({ path, thumb_path }) => [path, thumb_path]), couplePath(10), coupleMediumPath(10)].toSorted(),
    );
  });

  it("올린 지 하루가 안 됐거나 올린 시각을 모르는 파일은 업로드 중일 수 있어 지우지 않고 개수만 센다", async () => {
    const uploading = photoPaths(2);
    const { storage, files } = createFakeStorage({
      [photoPaths(1).path]: OLD,
      [uploading.path]: RECENT,
      [uploading.thumb_path]: undefined,
      [couplePath(11)]: "알 수 없는 시각",
    });

    const result = await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: [photoPaths(1)] }),
      now: NOW,
      deleteTrashRows: noTrashDelete,
      shouldDelete: true,
    });

    expect(result).toMatchObject({ status: "deleted", orphanPaths: [], recentOrphanCount: 3 });
    expect(files.size).toBe(4);
  });

  it("이름 규칙에 없는 파일은 지우지 않고 따로 알린다", async () => {
    const { storage, files } = createFakeStorage({
      [photoPaths(1).path]: OLD,
      "misc/note.txt": OLD,
      [`${DATE_ID}/${uuid(2)}.png`]: OLD,
    });

    const result = await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: [photoPaths(1)] }),
      now: NOW,
      deleteTrashRows: noTrashDelete,
      shouldDelete: true,
    });

    expect(result.orphanPaths).toEqual([]);
    expect(result.unknownPaths.toSorted()).toEqual(["misc/note.txt", `${DATE_ID}/${uuid(2)}.png`].toSorted());
    expect(files.size).toBe(3);
  });

  it("삭제가 꺼져 있으면 지울 목록만 돌려주고 지우지 않는다", async () => {
    const { storage } = createFakeStorage({ [photoPaths(1).path]: OLD, [couplePath(11)]: OLD });

    const result = await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: [photoPaths(1)] }),
      now: NOW,
      deleteTrashRows: noTrashDelete,
      shouldDelete: false,
    });

    expect(result).toEqual(expect.objectContaining({ status: "preview", orphanPaths: [couplePath(11)] }));
    expect(result).not.toHaveProperty("reason");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("미리 보기에 버킷 전체 파일 수와 크기 합계를 담고, 크기를 모르는 파일은 합계에서 빼고 따로 센다", async () => {
    const files: Record<string, { name: string; id: string | null; created_at?: string; metadata?: Record<string, unknown> | null }[]> = {
      "": [
        { name: DATE_ID, id: null },
        { name: "couple", id: null },
      ],
      [DATE_ID]: [
        { name: `${uuid(1)}.jpg`, id: "1", created_at: OLD, metadata: { size: 700_000 } },
        { name: `${uuid(1)}_thumb.jpg`, id: "2", created_at: OLD, metadata: { size: 60_000 } },
        { name: `${uuid(2)}.jpg`, id: "3", created_at: OLD, metadata: { size: 500_000 } },
      ],
      couple: [
        { name: `${uuid(10)}.jpg`, id: "4", created_at: OLD, metadata: { size: "알 수 없음" } },
        { name: `${uuid(10)}_medium.jpg`, id: "5", created_at: OLD, metadata: null },
      ],
    };
    const storage: CleanupStorage = {
      list: vi.fn(async (prefix: string) => ({ data: files[prefix] ?? [], error: null })),
      remove: vi.fn(),
    };

    const result = await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: [photoPaths(1)], couplePhotoPath: couplePath(10) }),
      now: NOW,
      deleteTrashRows: noTrashDelete,
      shouldDelete: false,
    });

    // 주인 없는 파일(uuid(2))도 아직 공간을 차지하므로 합계에 넣는다
    expect(result).toMatchObject({ status: "preview", fileCount: 5, totalBytes: 1_260_000, unsizedCount: 2 });
  });

  it("지난 1일 정리 때 이미 하루가 넘었던 주인 없는 파일을 따로 세어, 정리가 지웠어야 할 파일을 알 수 있게 한다", async () => {
    // NOW(11월 10일) 기준 마지막 정리는 11월 1일 UTC 4시다. 10월 30일 파일은 그때 하루가 넘었고, 11월 7일 파일은 그 뒤에 올렸다
    const { storage } = createFakeStorage({
      [photoPaths(1).path]: OLD,
      [photoPaths(1).thumb_path]: OLD,
      [couplePath(11)]: "2026-10-30T12:00:00Z",
      [couplePath(12)]: "2026-11-07T12:00:00Z",
    });

    const result = await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: [photoPaths(1)] }),
      now: NOW,
      deleteTrashRows: noTrashDelete,
      shouldDelete: false,
    });

    expect(result).toMatchObject({ status: "preview", staleOrphanCount: 1 });
    expect(result.orphanPaths).toHaveLength(2);
  });

  it("지울 파일이 한 번에 100개를 넘으면 지우지 않고 이유와 함께 멈춘다", async () => {
    const kept = Array.from({ length: 60 }, (_, index) => photoPaths(index));
    const orphans = Array.from({ length: 51 }, (_, index) => photoPaths(100 + index));
    const { storage } = createFakeStorage(
      Object.fromEntries([...kept, ...orphans].flatMap(({ path, thumb_path }) => [[path, OLD], [thumb_path, OLD]])),
    );

    const result = await cleanupOrphanPhotos({ storage, readReferences: referencesOf({ photos: kept }), now: NOW,
      deleteTrashRows: noTrashDelete, shouldDelete: true });

    expect(result).toMatchObject({ status: "blocked", reason: expect.stringContaining("102개") });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("삭제가 꺼져 있어도 지웠다면 멈췄을 이유를 함께 돌려준다", async () => {
    const { storage } = createFakeStorage({ [couplePath(11)]: OLD });

    const result = await cleanupOrphanPhotos({ storage, readReferences: referencesOf({}), now: NOW,
      deleteTrashRows: noTrashDelete, shouldDelete: false });

    expect(result).toMatchObject({ status: "preview", orphanPaths: [couplePath(11)], reason: expect.stringContaining("쓰는 파일(0개)") });
  });

  it("지울 파일이 쓰는 파일보다 많으면 DB를 잘못 읽었을 수 있어 지우지 않는다", async () => {
    const { storage } = createFakeStorage({ [photoPaths(1).path]: OLD, [photoPaths(1).thumb_path]: OLD });

    const result = await cleanupOrphanPhotos({ storage, readReferences: referencesOf({}), now: NOW,
      deleteTrashRows: noTrashDelete, shouldDelete: true });

    expect(result).toMatchObject({ status: "blocked", reason: expect.stringContaining("쓰는 파일(0개)") });
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("파일 목록을 먼저 읽고 DB를 읽어, 그사이 저장된 기록의 새 사진을 주인 없는 파일로 보지 않는다", async () => {
    const order: string[] = [];
    const { storage } = createFakeStorage({ [photoPaths(1).path]: OLD });
    vi.mocked(storage.list).mockImplementationOnce(async () => {
      order.push("list");
      return { data: [], error: null };
    });

    await cleanupOrphanPhotos({
      storage,
      readReferences: async () => {
        order.push("references");
        return { photos: [], couplePhotoPath: undefined, trash: [] };
      },
      now: NOW,
      deleteTrashRows: noTrashDelete,
      shouldDelete: false,
    });

    expect(order).toEqual(["list", "references"]);
  });

  it("지우기 직전에 다시 읽었을 때 기록에 이어진 파일은 빼고 지운다", async () => {
    const kept = [photoPaths(1), photoPaths(4)];
    const reused = photoPaths(2);
    const { storage, files } = createFakeStorage(
      Object.fromEntries([...kept, reused].flatMap(({ path, thumb_path }) => [[path, OLD], [thumb_path, OLD]])),
    );
    // 첫 읽기 뒤, 저장 결과를 몰라 남겨 둔 사진을 다시 저장해 기록이 그 파일을 가리키게 됐다
    const readReferences = vi
      .fn<() => Promise<PhotoFileReferences>>()
      .mockResolvedValueOnce({ photos: kept, couplePhotoPath: undefined, trash: [] })
      .mockResolvedValueOnce({ photos: [...kept, reused], couplePhotoPath: undefined, trash: [] });

    const result = await cleanupOrphanPhotos({ storage, readReferences, now: NOW,
      deleteTrashRows: noTrashDelete, shouldDelete: true });

    expect(result).toMatchObject({ status: "deleted", orphanPaths: [] });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(files.has(reused.path)).toBe(true);
  });

  it("DB를 읽지 못하면 아무것도 지우지 않고 에러를 낸다", async () => {
    const { storage } = createFakeStorage({ [couplePath(11)]: OLD });

    await expect(
      cleanupOrphanPhotos({
        storage,
        readReferences: () => Promise.reject(new Error("db down")),
        now: NOW,
      deleteTrashRows: noTrashDelete,
        shouldDelete: true,
      }),
    ).rejects.toThrow("db down");
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it("Storage가 지우기를 거부하면 에러를 낸다", async () => {
    const { storage } = createFakeStorage(
      { [photoPaths(1).path]: OLD, [photoPaths(1).thumb_path]: OLD, [couplePath(11)]: OLD },
      { message: "denied" },
    );

    await expect(
      cleanupOrphanPhotos({ storage, readReferences: referencesOf({ photos: [photoPaths(1)] }), now: NOW,
      deleteTrashRows: noTrashDelete, shouldDelete: true }),
    ).rejects.toThrow("사진 파일을 지우지 못했습니다: denied");
  });
});

describe("cleanupOrphanPhotos 휴지통", () => {
  // NOW(11월 10일 12시) 기준: 40일 전·30일 반 전은 보관 기간(30일)이 지났고, 40일 전 것만 마지막 정리(11월 1일) 때도 지나 있었다
  const overdue = trashOf(1, "2026-10-01T12:00:00Z");
  const justExpired = trashOf(2, "2026-10-11T00:00:00Z");
  const kept = trashOf(3, "2026-11-01T12:00:00Z");
  const inUse = [photoPaths(10), photoPaths(11), photoPaths(12)];
  const filesOf = (...rows: { path: string; thumb_path: string }[]) =>
    Object.fromEntries(rows.flatMap(({ path, thumb_path }) => [[path, OLD], [thumb_path, OLD]]));

  it("보관 기간 안의 휴지통 파일은 주인 없는 파일로 보지 않고 남기며, 기간이 지난 파일과 그 휴지통 행만 지운다", async () => {
    const { storage, files } = createFakeStorage(filesOf(...inUse, overdue, justExpired, kept));
    const deleteTrashRows = vi.fn<(ids: string[]) => Promise<void>>(async () => undefined);

    const result = await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: inUse, trash: [overdue, justExpired, kept] }),
      now: NOW,
      deleteTrashRows,
      shouldDelete: true,
    });

    expect(result).toMatchObject({ status: "deleted", orphanPaths: [], expiredTrashCount: 2, overdueTrashCount: 1 });
    expect(files.has(kept.path)).toBe(true);
    expect(files.has(kept.thumb_path)).toBe(true);
    for (const row of [overdue, justExpired]) {
      expect(files.has(row.path)).toBe(false);
      expect(files.has(row.thumb_path)).toBe(false);
    }
    expect(deleteTrashRows).toHaveBeenCalledWith(["trash-1", "trash-2"]);
    // 영구 삭제한 휴지통 파일을 실행 기록에서 찾을 수 있게 돌려준다
    expect(result.expiredTrashPaths.toSorted()).toEqual(
      [overdue.path, overdue.thumb_path, justExpired.path, justExpired.thumb_path].toSorted(),
    );
  });

  it("기간이 지난 휴지통이 많으면 Storage·DB 한 번 요청 한도를 넘지 않게 나눠 지운다", async () => {
    const many = Array.from({ length: 300 }, (_, index) => trashOf(1000 + index, "2026-10-01T12:00:00Z"));
    const { storage } = createFakeStorage(filesOf(...inUse));
    const deleteTrashRows = vi.fn<(ids: string[]) => Promise<void>>(async () => undefined);

    await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: inUse, trash: many }),
      now: NOW,
      deleteTrashRows,
      shouldDelete: true,
    });

    const removeCalls = vi.mocked(storage.remove).mock.calls.map(([paths]) => paths.length);
    expect(removeCalls.reduce((sum, count) => sum + count, 0)).toBe(600);
    expect(Math.max(...removeCalls)).toBeLessThanOrEqual(500);
    const deleteCalls = deleteTrashRows.mock.calls.map(([ids]) => ids.length);
    expect(deleteCalls.reduce((sum, count) => sum + count, 0)).toBe(300);
    expect(Math.max(...deleteCalls)).toBeLessThanOrEqual(100);
  });

  it("미리 보기에 휴지통 파일 수·크기와 기간이 지난 행 수를 담고, 아무것도 지우지 않는다", async () => {
    const { storage } = createFakeStorage(filesOf(...inUse, overdue, kept));
    const deleteTrashRows = vi.fn<(ids: string[]) => Promise<void>>(async () => undefined);

    const result = await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: inUse, trash: [overdue, justExpired, kept] }),
      now: NOW,
      deleteTrashRows,
      shouldDelete: false,
    });

    // justExpired의 파일은 버킷에 없다(예전 앱이 이미 지움). 행만 지울 대상으로 센다
    expect(result).toMatchObject({
      status: "preview",
      trashFileCount: 4,
      trashBytes: 4,
      expiredTrashCount: 2,
      overdueTrashCount: 1,
    });
    expect(storage.remove).not.toHaveBeenCalled();
    expect(deleteTrashRows).not.toHaveBeenCalled();
  });

  it("지우기 직전에 다시 읽었을 때 기록이 쓰는 경로는 휴지통 기간이 지났어도 지우지 않는다", async () => {
    const { storage, files } = createFakeStorage(filesOf(...inUse, overdue));
    const readReferences = vi
      .fn<() => Promise<PhotoFileReferences>>()
      .mockResolvedValueOnce({ photos: inUse, couplePhotoPath: undefined, trash: [overdue] })
      .mockResolvedValueOnce({ photos: [...inUse, overdue], couplePhotoPath: undefined, trash: [overdue] });

    await cleanupOrphanPhotos({ storage, readReferences, now: NOW, deleteTrashRows: noTrashDelete, shouldDelete: true });

    expect(files.has(overdue.path)).toBe(true);
  });

  it("휴지통 행을 지우지 못하면 에러를 낸다(파일은 이미 지웠고 다음 달에 행을 다시 지운다)", async () => {
    const { storage } = createFakeStorage(filesOf(...inUse, overdue));

    await expect(
      cleanupOrphanPhotos({
        storage,
        readReferences: referencesOf({ photos: inUse, trash: [overdue] }),
        now: NOW,
        deleteTrashRows: () => Promise.reject(new Error("db down")),
        shouldDelete: true,
      }),
    ).rejects.toThrow("db down");
  });

  it("지운 시각을 읽을 수 없는 휴지통 행은 기간이 지나지 않은 것으로 보고 남긴다", async () => {
    const odd = trashOf(4, "알 수 없음");
    const { storage, files } = createFakeStorage(filesOf(...inUse, odd));

    const result = await cleanupOrphanPhotos({
      storage,
      readReferences: referencesOf({ photos: inUse, trash: [odd] }),
      now: NOW,
      deleteTrashRows: noTrashDelete,
      shouldDelete: true,
    });

    expect(result).toMatchObject({ expiredTrashCount: 0, orphanPaths: [] });
    expect(files.has(odd.path)).toBe(true);
  });
});

describe("shouldDeleteOrphans", () => {
  const URL_PATH = "https://example.test/api/photo-cleanup";

  it.each(["true", "TRUE", " true "])("PHOTO_CLEANUP_DELETE가 %j이고 미리 보기가 아니면 지운다", (deleteFlag) => {
    expect(shouldDeleteOrphans({ requestUrl: URL_PATH, deleteFlag })).toBe(true);
  });

  it.each([undefined, "", "1", "false"])("PHOTO_CLEANUP_DELETE가 %j이면 지우지 않는다", (deleteFlag) => {
    expect(shouldDeleteOrphans({ requestUrl: URL_PATH, deleteFlag })).toBe(false);
  });

  it.each(["?preview=1", "?preview=true", "?preview", "?preview=0"])("주소에 %s가 있으면 삭제가 켜져 있어도 지우지 않는다", (query) => {
    expect(shouldDeleteOrphans({ requestUrl: `${URL_PATH}${query}`, deleteFlag: "true" })).toBe(false);
  });
});
