import { describe, expect, it } from "vitest";
import { collectReferencedPaths, findExpiredTrash, scanOrphanFiles, type PhotoFileReferences } from "./orphan-scan";

const RECORD = "10000000-0000-4000-8000-000000000001";
const toPath = (photo: string, suffix = ""): string => `${RECORD}/20000000-0000-4000-8000-00000000000${photo}${suffix}.jpg`;
const NOW = new Date("2026-11-20T12:00:00Z");
// 지난 정리 예약 시각(11월 1일 UTC 4시)보다 하루 넘게 앞선 시각
const BEFORE_LAST_CLEANUP = "2026-10-20T00:00:00Z";
const TWO_DAYS_AGO = "2026-11-18T12:00:00Z";
const ONE_HOUR_AGO = "2026-11-20T11:00:00Z";

const references: PhotoFileReferences = {
  photos: [{ path: toPath("a"), thumb_path: toPath("a", "_thumb") }],
  couplePhotoPath: undefined,
  trash: [
    { id: "t1", path: toPath("b"), thumb_path: toPath("b", "_thumb"), deleted_at: "2026-10-01T00:00:00Z" },
    { id: "t2", path: toPath("c"), thumb_path: toPath("c", "_thumb"), deleted_at: "2026-11-19T00:00:00Z" },
  ],
};

describe("collectReferencedPaths", () => {
  it("기록 사진의 원본·썸네일과 커플 사진의 원본·중간 크기를 모은다", () => {
    const paths = collectReferencedPaths({ ...references, couplePhotoPath: "couple/a.jpg" });

    expect([...paths].toSorted()).toEqual([toPath("a"), toPath("a", "_thumb"), "couple/a.jpg", "couple/a_medium.jpg"].toSorted());
  });
});

describe("findExpiredTrash", () => {
  it("보관 기간(30일)이 지난 휴지통 행만 고른다", () => {
    expect(findExpiredTrash(references.trash, NOW).map(({ id }) => id)).toEqual(["t1"]);
  });
});

describe("scanOrphanFiles", () => {
  it("파일을 쓰는 파일·휴지통 파일·주인 없는 파일·모르는 이름으로 나누고 크기를 센다", () => {
    // Arrange
    const files = [
      { path: toPath("a"), size: 100, createdAt: TWO_DAYS_AGO },
      { path: toPath("b"), size: 30, createdAt: BEFORE_LAST_CLEANUP },
      { path: toPath("d"), size: 10, createdAt: BEFORE_LAST_CLEANUP },
      { path: toPath("e"), size: 10, createdAt: TWO_DAYS_AGO },
      { path: toPath("f"), size: undefined, createdAt: ONE_HOUR_AGO },
      { path: "notes.txt", size: 5, createdAt: BEFORE_LAST_CLEANUP },
    ];

    // Act
    const scan = scanOrphanFiles({ files, references, now: NOW });

    // Assert
    expect(scan).toMatchObject({
      inUseCount: 1,
      trashFileCount: 1,
      trashBytes: 30,
      orphanPaths: [toPath("d"), toPath("e")],
      staleOrphanCount: 1,
      recentOrphanCount: 1,
      unknownPaths: ["notes.txt"],
      fileCount: 6,
      totalBytes: 155,
      unsizedCount: 1,
      expiredTrashCount: 1,
      expiredTrashPaths: [toPath("b"), toPath("b", "_thumb")],
      // 10월 1일에 지운 행은 지난 정리(11월 1일) 때 이미 30일이 지나 그 정리가 지웠어야 했다
      overdueTrashCount: 1,
    });
  });

  it("올린 시각을 모르는 앱 파일은 업로드 중일 수 있어 지울 대상에 넣지 않는다", () => {
    const scan = scanOrphanFiles({ files: [{ path: toPath("d"), size: 1, createdAt: undefined }], references, now: NOW });

    expect([scan.orphanPaths, scan.recentOrphanCount]).toEqual([[], 1]);
  });
});
