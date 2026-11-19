import { UUID_PATTERN_SOURCE as UUID } from "@/lib/guards";
import type { AlbumObject } from "./album-files";
import { getLastCleanupStart } from "./cleanup-schedule";
import { findMediumPhotoPath, toMediumPhotoPath } from "./paths";
import { isTrashExpired } from "./trash";

/**
 * 이보다 최근에 올린 파일은 업로드 중이거나 기록 저장 직전일 수 있어 지우지 않는다(하루).
 * 사진은 Storage에 먼저 올리고 DB 행을 나중에 만든다(#5)
 */
const MIN_ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;

// 앱이 만드는 이름만 지운다: 기록 사진 `{date_id}/{photo_id}.jpg`·`_medium.jpg`·`_thumb.jpg`, 커플 사진 `couple/{id}.jpg`·`_medium.jpg`
const APP_FILE_PATH = new RegExp(`^(?:${UUID}/${UUID}(?:_medium|_thumb)?|couple/${UUID}(?:_medium)?)\\.jpg$`, "i");

/** DB에서 읽은, 파일을 가리키는 칸들 */
export interface PhotoFileReferences {
  /** `photos` 표의 모든 행 */
  photos: { path: string; thumb_path: string }[];
  /** `couple_photo.path`. 커플 사진이 없으면 undefined */
  couplePhotoPath: string | undefined;
  /** `photo_trash` 표의 모든 행(#311). 보관 기간 안의 파일은 지우지 않는다 */
  trash: { id: string; path: string; thumb_path: string; deleted_at: string }[];
}

/** 버킷 파일을 DB가 가리키는 파일과 견준 결과 */
export interface OrphanScan {
  /** 하루 넘게 주인이 없는 앱 파일. 지울 대상 */
  orphanPaths: string[];
  /** 주인이 없지만 올린 지 하루가 안 됐거나 올린 시각을 몰라 남긴 파일 수 */
  recentOrphanCount: number;
  /** 앱이 만드는 이름이 아니라 건드리지 않은 파일 */
  unknownPaths: string[];
  /**
   * `orphanPaths` 가운데 지난 정리 예약 시각(매달 1일 UTC 4시)에 이미 하루가 넘었던 파일 수. 그 정리가 지웠어야 하므로
   * 정리가 제대로 돌았다면 0이다(저장 공간 월간 점검 #310이 본다)
   */
  staleOrphanCount: number;
  /** 기록·커플 사진이 가리키는 파일 수 */
  inUseCount: number;
  /** 목록을 읽을 때 버킷에 있던 파일 수(지우기 전 기준) */
  fileCount: number;
  /** 그 파일들의 크기 합계(바이트). 저장 공간 월간 점검(#310)이 무료 한도와 비교한다 */
  totalBytes: number;
  /** Storage가 크기를 주지 않아 `totalBytes`에서 빠진 파일 수 */
  unsizedCount: number;
  /** 버킷에 있는 휴지통 파일 수와 크기 합계(`totalBytes`에 들어 있다) */
  trashFileCount: number;
  trashBytes: number;
  /** 보관 기간이 지나 이번 정리에서 지울 휴지통 행 수와 그 파일 경로(영구 삭제를 실행 기록에서 찾을 수 있게) */
  expiredTrashCount: number;
  expiredTrashPaths: string[];
  /** 그 가운데 지난 정리 예약 시각에 이미 기간이 지났던 행 수. 정리가 제대로 돌았다면 0이다 */
  overdueTrashCount: number;
}

// 사진 행 하나가 가리키는 파일. 기록 상세용 중간 크기(#411)는 DB에 경로가 없고 원본 경로에서 정한다.
// 중간 크기를 만들기 전에 올린 사진은 그 파일이 없지만, 없는 경로는 버킷 목록과 견줄 때도 지울 때도 문제가 없다
const toFilePaths = (rows: { path: string; thumb_path: string }[]): string[] =>
  rows.flatMap(({ path, thumb_path }) => {
    const mediumPath = findMediumPhotoPath(path);
    return mediumPath ? [path, mediumPath, thumb_path] : [path, thumb_path];
  });

/**
 * 기록·커플 사진이 가리키는 파일 경로. DB에 없는 중간 크기 경로(기록 상세용, 커플 홈 카드용)도 넣는다.
 *
 * @example collectReferencedPaths({ photos: [], couplePhotoPath: "couple/a.jpg", trash: [] }).has("couple/a_medium.jpg") // true
 */
export const collectReferencedPaths = ({ photos, couplePhotoPath }: PhotoFileReferences): Set<string> => {
  const paths = new Set(toFilePaths(photos));
  if (couplePhotoPath) {
    // 홈 카드용 중간 크기는 DB에 경로가 없고 원본 경로에서 정한다(#218)
    paths.add(couplePhotoPath);
    paths.add(toMediumPhotoPath(couplePhotoPath));
  }
  return paths;
};

const isOlderThan = ({ createdAt, now, ageMs }: { createdAt: string | undefined; now: Date; ageMs: number }): boolean => {
  const uploadedAt = createdAt === undefined ? Number.NaN : Date.parse(createdAt);
  // 올린 시각을 모르면 업로드 중일 수 있어 지우지 않는다
  return !Number.isNaN(uploadedAt) && now.getTime() - uploadedAt >= ageMs;
};

const isFileSize = (size: unknown): size is number => typeof size === "number" && Number.isFinite(size) && size >= 0;

interface ScanOrphanFilesParams {
  files: AlbumObject[];
  references: PhotoFileReferences;
  now: Date;
}

/**
 * 보관 기간이 지난 휴지통 행.
 *
 * @example findExpiredTrash(references.trash, new Date())
 */
export const findExpiredTrash = (trash: PhotoFileReferences["trash"], now: Date): PhotoFileReferences["trash"] =>
  trash.filter(({ deleted_at }) => isTrashExpired({ deletedAt: deleted_at, now }));

/**
 * 버킷 파일마다 쓰는 파일·휴지통 파일·주인 없는 파일·모르는 이름으로 나누고 크기를 센다(#31, #310, #311).
 *
 * @example const scan = scanOrphanFiles({ files: await listAlbumObjects(storage), references, now: new Date() });
 */
export const scanOrphanFiles = ({ files, references, now }: ScanOrphanFilesParams): OrphanScan => {
  const lastCleanupStart = getLastCleanupStart(now);
  const referencedPaths = collectReferencedPaths(references);
  const expiredTrash = findExpiredTrash(references.trash, now);
  const trashPaths = new Set(toFilePaths(references.trash));
  const scan: OrphanScan = {
    orphanPaths: [],
    recentOrphanCount: 0,
    unknownPaths: [],
    staleOrphanCount: 0,
    inUseCount: 0,
    fileCount: files.length,
    totalBytes: 0,
    unsizedCount: 0,
    trashFileCount: 0,
    trashBytes: 0,
    expiredTrashCount: expiredTrash.length,
    expiredTrashPaths: toFilePaths(expiredTrash),
    overdueTrashCount: findExpiredTrash(expiredTrash, lastCleanupStart).length,
  };

  for (const { path, size, createdAt } of files) {
    if (isFileSize(size)) scan.totalBytes += size;
    else scan.unsizedCount += 1;

    if (referencedPaths.has(path)) scan.inUseCount += 1;
    else if (trashPaths.has(path)) {
      scan.trashFileCount += 1;
      if (isFileSize(size)) scan.trashBytes += size;
    } else if (!APP_FILE_PATH.test(path)) scan.unknownPaths.push(path);
    else if (isOlderThan({ createdAt, now, ageMs: MIN_ORPHAN_AGE_MS })) {
      scan.orphanPaths.push(path);
      if (isOlderThan({ createdAt, now: lastCleanupStart, ageMs: MIN_ORPHAN_AGE_MS })) scan.staleOrphanCount += 1;
    } else scan.recentOrphanCount += 1;
  }
  return scan;
};
