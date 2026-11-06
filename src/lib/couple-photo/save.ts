import { buildCouplePhotoPath } from "@/lib/photos/paths";
import { uploadPhotoFile, type PhotoStorage } from "@/lib/photos/upload";

/** 커플 사진 경로를 바꾼 결과. `data`는 밀려난 예전 파일 경로(없으면 null)다 */
type SwapResult = PromiseLike<{ data: string | null; error: { message: string } | null }>;

/** 경로 바꾸기를 부르고, 실패 응답과 예외(네트워크 끊김 등)를 같은 모양으로 돌려준다 */
const callSwap = async (swap: () => SwapResult): Promise<{ previousPath: string | null; error?: unknown }> => {
  try {
    const { data, error } = await swap();
    return error ? { previousPath: null, error } : { previousPath: data };
  } catch (error) {
    return { previousPath: null, error };
  }
};

const MESSAGES = {
  save: "사진을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.",
  clear: "사진을 지우지 못했어요. 잠시 후 다시 시도해 주세요.",
} as const;

/** 커플 사진 경로를 저장하거나 비우지 못했을 때. `message`는 화면에 그대로 보여 줄 수 있다 */
export class CouplePhotoError extends Error {
  readonly action: keyof typeof MESSAGES;

  constructor(action: keyof typeof MESSAGES, options?: ErrorOptions) {
    super(MESSAGES[action], options);
    this.name = "CouplePhotoError";
    this.action = action;
  }
}

interface CleanupParams {
  storage: Pick<PhotoStorage, "remove">;
  /**
   * 밀려난 예전 파일을 지우지 못했을 때 불린다. 사진은 이미 바뀌었으므로 실패로 알리지 않고,
   * 남은 파일은 주인 없는 파일 정리(#31)에서 지운다
   */
  onCleanupError?: (error: unknown) => void;
}

export interface ReplaceCouplePhotoParams extends CleanupParams {
  storage: PhotoStorage;
  /** 새 사진 id. `crypto.randomUUID()`로 정해 경로가 늘 새것이 되게 한다(덮어쓰지 않음) */
  photoId: string;
  /** `resizePhoto`로 줄인 원본 */
  photo: Blob;
  /** `(path) => supabase.rpc("set_couple_photo", { p_path: path })` */
  savePath: (path: string) => SwapResult;
}

export interface ClearCouplePhotoParams extends CleanupParams {
  /** `() => supabase.rpc("clear_couple_photo")` */
  clearPath: () => SwapResult;
}

const removePrevious = async (
  { storage, onCleanupError }: CleanupParams,
  previousPath: string | null,
  currentPath?: string,
): Promise<void> => {
  // 같은 경로를 돌려받는 건 지금 보여 주는 파일이라 지우지 않는다
  if (!previousPath || previousPath === currentPath) return;
  try {
    const { error } = await storage.remove([previousPath]);
    if (error) onCleanupError?.(error);
  } catch (error) {
    onCleanupError?.(error);
  }
};

/**
 * 커플 사진을 새 사진으로 바꾼다(처음 올릴 때도 같다).
 * 새 파일을 먼저 올리고 경로를 저장한 뒤, 저장이 돌려준 예전 파일을 지운다. 두 사람이 동시에 바꿔도
 * 각자 자기가 밀어낸 파일만 받으므로 파일이 남지 않는다. 저장이 실패하면 올린 새 파일을 지우고 예전 사진은 그대로 둔다.
 *
 * @throws {PhotoError} 올리지 못했을 때
 * @throws {CouplePhotoError} 경로를 저장하지 못했을 때(`save`)
 * @throws {Error} 사진 id가 UUID가 아니면(아무것도 올리지 않는다)
 * @example
 * await replaceCouplePhoto({
 *   storage: supabase.storage.from(ALBUM_BUCKET),
 *   photoId: crypto.randomUUID(),
 *   photo: (await resizePhoto(file)).original,
 *   savePath: (path) => supabase.rpc("set_couple_photo", { p_path: path }),
 *   onCleanupError: console.error,
 * })
 */
export const replaceCouplePhoto = async ({
  storage,
  photoId,
  photo,
  savePath,
  onCleanupError,
}: ReplaceCouplePhotoParams): Promise<void> => {
  const path = buildCouplePhotoPath(photoId);
  // 저장이 안 된 새 파일은 어디에서도 가리키지 않으므로, 실패하면 바로 지운다(정리 실패는 원래 실패 이유를 가리지 않게 삼킨다)
  const discardNewFile = () => storage.remove([path]).catch(() => undefined);

  try {
    await uploadPhotoFile({ storage, path, body: photo });
  } catch (error) {
    await discardNewFile();
    throw error;
  }

  // 저장은 됐는데 응답만 끊겼을 수 있어, 새 파일을 지우기 전에 같은 경로로 한 번 더 저장한다.
  // 이미 저장됐다면 DB가 null을 돌려줘 지금 사진을 지우지 않는다(첫 응답의 예전 파일은 남아 #31에서 정리한다)
  let result = await callSwap(() => savePath(path));
  if (result.error) result = await callSwap(() => savePath(path));
  if (result.error) {
    await discardNewFile();
    throw new CouplePhotoError("save", { cause: result.error });
  }
  const { previousPath } = result;

  await removePrevious({ storage, onCleanupError }, previousPath, path);
};

/**
 * 커플 사진을 없앤다. 경로를 먼저 비우고 그 파일을 지운다(파일을 먼저 지우면 비우기가 실패했을 때 깨진 사진이 보인다).
 *
 * @throws {CouplePhotoError} 경로를 비우지 못했을 때(`clear`)
 * @example
 * await clearCouplePhoto({
 *   storage: supabase.storage.from(ALBUM_BUCKET),
 *   clearPath: () => supabase.rpc("clear_couple_photo"),
 *   onCleanupError: console.error,
 * })
 */
export const clearCouplePhoto = async ({ storage, clearPath, onCleanupError }: ClearCouplePhotoParams): Promise<void> => {
  const { previousPath, error } = await callSwap(clearPath);
  if (error) throw new CouplePhotoError("clear", { cause: error });

  await removePrevious({ storage, onCleanupError }, previousPath);
};
