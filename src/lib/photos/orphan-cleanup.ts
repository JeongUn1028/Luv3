import { listAlbumObjects, type AlbumListStorage } from "./album-files";
import { collectReferencedPaths, findExpiredTrash, scanOrphanFiles, type OrphanScan, type PhotoFileReferences } from "./orphan-scan";

/** 한 번에 지울 수 있는 최대 주인 없는 파일 수. 두 사람만 써서 이보다 많으면 무언가 잘못 읽은 것으로 보고 멈춘다 */
const MAX_ORPHANS_PER_RUN = 100;

// Storage 지우기는 한 번에 1000개까지 받고, 휴지통 행 지우기는 id를 주소에 담아 너무 길면 거부된다. 넉넉히 나눈다
const REMOVE_BATCH_SIZE = 500;
const TRASH_DELETE_BATCH_SIZE = 100;

/** `supabase.storage.from("album")`에서 목록 읽기와 지우기만 쓴다 */
export interface CleanupStorage extends AlbumListStorage {
  remove: (paths: string[]) => Promise<{ error: { message: string } | null }>;
}

/**
 * 정리 결과. `preview`는 지우지 않고 목록만(지웠다면 멈췄을 때는 그 이유 `reason`도), `blocked`는 지울 목록이 이상해 멈춤,
 * `deleted`는 `orphanPaths`를 지움
 */
export type CleanupResult = OrphanScan &
  ({ status: "preview"; reason?: string } | { status: "blocked"; reason: string } | { status: "deleted" });

interface CleanupOrphanPhotosParams {
  storage: CleanupStorage;
  readReferences: () => Promise<PhotoFileReferences>;
  now: Date;
  /** 파일을 지운 뒤 휴지통 행을 지운다. 실패하면 에러를 낸다 */
  deleteTrashRows: (ids: string[]) => Promise<void>;
  /** false면 지울 목록만 돌려준다 */
  shouldDelete: boolean;
}

const chunk = <T,>(items: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));

const findBlockReason = ({ orphanPaths, inUseCount }: OrphanScan): string | undefined => {
  if (orphanPaths.length > MAX_ORPHANS_PER_RUN) {
    return `지울 파일이 ${orphanPaths.length}개로 한 번에 지울 수 있는 ${MAX_ORPHANS_PER_RUN}개를 넘습니다. 목록을 확인하세요.`;
  }
  // DB를 비어 있게 잘못 읽으면 모든 사진이 주인 없는 파일로 보인다
  if (orphanPaths.length > inUseCount) {
    return `지울 파일(${orphanPaths.length}개)이 쓰는 파일(${inUseCount}개)보다 많습니다. 목록을 확인하세요.`;
  }
  return undefined;
};

/**
 * album 버킷에서 기록·커플 사진이 가리키지 않고 올린 지 하루 넘은 파일을 찾아, `shouldDelete`면 지운다(#31).
 * 파일 목록을 먼저 읽고 DB를 나중에 읽어, 그사이 저장된 기록의 사진을 주인 없는 파일로 보지 않는다.
 * 지우기 직전에 DB를 한 번 더 읽어, 그사이 기록에 이어진 파일(저장 결과를 몰라 남겨 둔 사진을 다시 저장한 경우)은 빼고 지운다.
 * 휴지통(#311) 파일은 보관 기간 안이면 남기고, 지난 것은 파일을 지운 뒤 휴지통 행도 지운다.
 * 앱이 만드는 이름이 아닌 파일은 건드리지 않고, 지울 목록이 너무 많으면 지우지 않고 멈춘다.
 *
 * @throws {Error} 목록·DB를 읽지 못했거나 Storage가 지우기를 거부했을 때(읽기 실패면 아무것도 지우지 않는다)
 * @example
 * const result = await cleanupOrphanPhotos({
 *   storage: supabase.storage.from(ALBUM_BUCKET),
 *   readReferences: () => readPhotoFileReferences(supabase),
 *   now: new Date(),
 *   deleteTrashRows: (ids) => deletePhotoTrashRows(supabase, ids),
 *   shouldDelete: process.env.PHOTO_CLEANUP_DELETE === "true",
 * });
 */
export const cleanupOrphanPhotos = async ({
  storage,
  readReferences,
  now,
  deleteTrashRows,
  shouldDelete,
}: CleanupOrphanPhotosParams): Promise<CleanupResult> => {
  const files = await listAlbumObjects(storage);
  const references = await readReferences();
  const scan = scanOrphanFiles({ files, references, now });

  const reason = findBlockReason(scan);

  if (!shouldDelete) return reason ? { ...scan, status: "preview", reason } : { ...scan, status: "preview" };
  if (reason) return { ...scan, status: "blocked", reason };

  const expiredTrash = findExpiredTrash(references.trash, now);
  if (scan.orphanPaths.length === 0 && expiredTrash.length === 0) return { ...scan, status: "deleted" };

  const latestPaths = collectReferencedPaths(await readReferences());
  const orphanPaths = scan.orphanPaths.filter((path) => !latestPaths.has(path));
  // 파일이 이미 없는 행(예전 앱이 지운 사진)도 지울 목록에 넣는다. 없는 파일을 지우는 것은 오류가 아니다
  const expiredTrashPaths = scan.expiredTrashPaths.filter((path) => !latestPaths.has(path));
  for (const paths of chunk([...orphanPaths, ...expiredTrashPaths], REMOVE_BATCH_SIZE)) {
    const { error } = await storage.remove(paths);
    if (error) throw new Error(`사진 파일을 지우지 못했습니다: ${error.message}`, { cause: error });
  }
  // 파일을 먼저 지운다. 행 지우기가 실패하면 다음 달에 같은 파일을 다시 지우고(없어도 괜찮다) 행을 지운다
  for (const ids of chunk(expiredTrash.map(({ id }) => id), TRASH_DELETE_BATCH_SIZE)) await deleteTrashRows(ids);
  return { ...scan, orphanPaths, expiredTrashPaths, status: "deleted" };
};

/**
 * 이번 요청에서 실제로 지울지 정한다. 주소에 `preview`가 있으면(값과 상관없이) 지우지 않고,
 * 아니면 환경 변수 `PHOTO_CLEANUP_DELETE`가 `true`일 때만 지운다(대소문자·앞뒤 공백 무시).
 *
 * @example shouldDeleteOrphans({ requestUrl: request.url, deleteFlag: process.env.PHOTO_CLEANUP_DELETE })
 */
export const shouldDeleteOrphans = ({ requestUrl, deleteFlag }: { requestUrl: string; deleteFlag: string | undefined }): boolean =>
  !new URL(requestUrl).searchParams.has("preview") && deleteFlag?.trim().toLowerCase() === "true";
