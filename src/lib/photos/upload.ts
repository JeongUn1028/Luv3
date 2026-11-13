import { PhotoError } from "./errors";
import { PHOTO_CACHE_CONTROL, UPLOAD_CONTENT_TYPE } from "./limits";
import { buildPhotoPaths, type PhotoPaths } from "./paths";
import type { ResizedPhoto } from "./resize";

interface StorageResult {
  error: { message: string } | null;
}

/**
 * 업로드에 필요한 Storage 기능만 뽑은 형태. `supabase.storage.from(ALBUM_BUCKET)`를 그대로 넘긴다.
 * 테스트에서는 메모리 저장소로 바꿔 끼운다.
 */
export interface PhotoStorage {
  upload: (
    path: string,
    body: Blob,
    options: { contentType: string; upsert: boolean; cacheControl: string },
  ) => Promise<StorageResult>;
  remove: (paths: string[]) => Promise<StorageResult>;
}

/** 고른 사진 한 장. 올리기 직전에 줄인다 */
export interface PhotoFileToUpload {
  /** 새 사진 행의 id. 업로드 전에 `crypto.randomUUID()`로 정해 두고 `photos.id`에도 같은 값을 쓴다 */
  photoId: string;
  file: File;
}

export interface UploadedPhoto extends PhotoPaths {
  photoId: string;
}

export interface ResizeAndUploadPhotosParams {
  storage: PhotoStorage;
  /** 사진이 속할 기록의 id. `dates.id`에도 같은 값을 쓴다 */
  dateId: string;
  photos: PhotoFileToUpload[];
  /** 고른 사진을 원본·썸네일로 줄인다. 보통 `resizePhoto` */
  resize: (file: File) => Promise<ResizedPhoto>;
  /** 앞선 저장 시도가 올렸을 수 있으면 true. 이미 있어도 성공으로 보고, 저장된 기록이 가리킬 수 있어 실패해도 지우지 않는다 */
  mayAlreadyExist?: boolean;
  /** 사진 한 장(원본+썸네일)을 다 올릴 때마다 (올린 장수, 전체 장수)로 불린다 */
  onProgress?: (uploadedCount: number, totalCount: number) => void;
}

/** 일시적인 네트워크 문제를 넘기려고 파일마다 최대 두 번 보낸다 */
const MAX_ATTEMPTS = 2;

const readField = (error: unknown, key: "status" | "statusCode"): unknown =>
  typeof error === "object" && error !== null ? Reflect.get(error, key) : undefined;

const getStatus = (error: unknown): number | undefined => {
  const status = readField(error, "status");
  return typeof status === "number" ? status : undefined;
};

// Storage는 용량 초과·중복을 HTTP 400으로 보내고 실제 이유는 본문의 statusCode("413", "409")에 담는다
const hasStatusCode = (error: unknown, code: number): boolean =>
  readField(error, "statusCode") === String(code) || getStatus(error) === code;

// 4xx는 다시 보내도 같은 결과다. 시간 초과(408)와 요청 과다(429)만 예외로 다시 시도한다.
const isRetryable = (error: unknown): boolean => {
  const status = getStatus(error);
  if (status === undefined) return true;
  return status < 400 || status >= 500 || status === 408 || status === 429;
};

const toPhotoError = (error: unknown): PhotoError =>
  new PhotoError(hasStatusCode(error, 413) ? "too-large" : "upload-failed", { cause: error });

interface UploadPhotoFileParams {
  storage: PhotoStorage;
  /** album 버킷 안의 경로 */
  path: string;
  body: Blob;
  /** 앞선 저장 시도가 같은 경로에 올렸을 수 있으면 true. 사진 id를 그대로 쓰므로 같은 파일이다 */
  mayAlreadyExist?: boolean;
}

/**
 * 파일 하나를 album 버킷의 `path`에 올린다(덮어쓰지 않음). 일시적인 실패면 한 번 더 시도한다.
 * 실패해도 이 함수는 파일을 지우지 않으므로, 응답만 끊기고 저장됐을 수 있는 `path`는 호출한 쪽이 정리한다.
 *
 * @throws {PhotoError} `upload-failed` 또는 버킷 용량 제한에 걸리면 `too-large`
 * @example await uploadPhotoFile({ storage: supabase.storage.from(ALBUM_BUCKET), path: buildCouplePhotoPath(photoId), body: original })
 */
export const uploadPhotoFile = async ({ storage, path, body, mayAlreadyExist = false }: UploadPhotoFileParams): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { error } = await storage.upload(path, body, { contentType: UPLOAD_CONTENT_TYPE, upsert: false, cacheControl: PHOTO_CACHE_CONTROL });
      if (!error) return;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    // 사진 id는 새로 만든 UUID라, 다시 보냈을 때의 중복은 응답만 끊기고 첫 요청이 저장됐다는 뜻이다
    if ((attempt > 1 || mayAlreadyExist) && hasStatusCode(lastError, 409)) return;
    if (!isRetryable(lastError)) break;
  }

  throw toPhotoError(lastError);
};

/**
 * 동시에 올리는 사진 수. 줄였지만 아직 다 올리지 못한 사진도 이 수까지만 메모리에 둔다(#312).
 * 휴대폰 회선에서 2~3장이면 한 장씩보다 충분히 빠르고, 더 늘려도 회선이 나뉠 뿐이다
 */
export const UPLOAD_CONCURRENCY = 3;

interface UploadFailure {
  error: unknown;
  /** 줄이기에서 난 에러면 true. 줄이기 에러는 이유(`decode-failed` 등)를 그대로 알린다 */
  isResizeError: boolean;
}

/**
 * 고른 사진을 한 장씩 줄여, 줄이는 대로 album 버킷의 `{date_id}/{photo_id}.jpg`, `{date_id}/{photo_id}_thumb.jpg`에 올린다.
 * 한 장을 올리는 동안 다음 장을 줄이고, 동시에 `UPLOAD_CONCURRENCY`장까지 올린다. 자리가 없으면 다음 장을 줄이지 않고 기다려,
 * 줄인 사진을 모두 메모리에 쌓아 두지 않는다. 파일마다 한 번 더 시도하고, 줄이기나 올리기가 실패하면 새 사진은 더 줄이지 않고
 * 올리던 사진이 끝나기를 기다린 뒤 이번에 올리려던 파일을 모두 지우고 에러를 낸다(먼저 지우면 지운 뒤에 올라간 파일이 남는다).
 * 앞선 저장 시도가 올렸을 수 있으면(`mayAlreadyExist`) 저장된 기록이 가리킬 수 있어 지우지 않는다.
 * 사진이 빠진 기록이 생기지 않도록, DB 행은 이 함수가 끝난 뒤에 만들고 행 저장이 실패하면 `removeUploadedPhotos`로 지운다.
 *
 * @throws {PhotoError} 줄이지 못했을 때 줄이기의 이유 그대로, 올리지 못했을 때 `upload-failed` 또는 버킷 용량 제한에 걸리면 `too-large`
 * @throws {Error} 기록·사진 id가 UUID가 아니면(아무것도 줄이거나 올리지 않는다)
 * @example
 * const uploaded = await resizeAndUploadPhotos({
 *   storage: supabase.storage.from(ALBUM_BUCKET),
 *   dateId,
 *   photos: [{ photoId: crypto.randomUUID(), file }],
 *   resize: resizePhoto,
 *   onProgress: (done, total) => setProgress(done / total),
 * })
 */
export const resizeAndUploadPhotos = async ({
  storage,
  dateId,
  photos,
  resize,
  mayAlreadyExist = false,
  onProgress,
}: ResizeAndUploadPhotosParams): Promise<UploadedPhoto[]> => {
  // id 형식 오류는 코드 실수라, 일부를 올린 뒤 "다시 시도해 주세요"로 감추지 않도록 올리기 전에 모두 확인한다
  const targets = photos.map((photo) => ({ ...photo, ...buildPhotoPaths(dateId, photo.photoId) }));
  const uploaded: UploadedPhoto[] = [];
  // 응답만 끊기고 저장된 파일도 지우도록, 성공한 경로가 아니라 시도한 경로를 모은다
  const attemptedPaths: string[] = [];
  const inFlight = new Set<Promise<void>>();
  let failure: UploadFailure | undefined;

  const uploadOne = async ({ photoId, path, thumbPath }: PhotoPaths & { photoId: string }, { original, thumb }: ResizedPhoto): Promise<void> => {
    attemptedPaths.push(path);
    await uploadPhotoFile({ storage, path, body: original, mayAlreadyExist });
    // 다른 사진이 이미 실패했으면 어차피 지울 파일이라 더 올리지 않는다
    if (failure) return;
    attemptedPaths.push(thumbPath);
    await uploadPhotoFile({ storage, path: thumbPath, body: thumb, mayAlreadyExist });
    uploaded.push({ photoId, path, thumbPath });
    onProgress?.(uploaded.length, targets.length);
  };

  for (const target of targets) {
    while (inFlight.size >= UPLOAD_CONCURRENCY && !failure) await Promise.race(inFlight);
    if (failure) break;

    let resized: ResizedPhoto;
    try {
      resized = await resize(target.file);
    } catch (error) {
      failure = { error, isResizeError: true };
      break;
    }
    if (failure) break;

    const task: Promise<void> = uploadOne(target, resized)
      .catch((error: unknown) => {
        failure ??= { error, isResizeError: false };
      })
      .finally(() => inFlight.delete(task));
    inFlight.add(task);
  }
  await Promise.all(inFlight);

  if (failure) {
    if (attemptedPaths.length > 0 && !mayAlreadyExist) {
      // 정리가 실패하면 파일이 남지만, 사용자에게는 원래 실패 이유를 알리는 게 맞아 여기서는 삼킨다
      await storage.remove(attemptedPaths).catch(() => undefined);
    }
    const { error, isResizeError } = failure;
    throw isResizeError || error instanceof PhotoError ? error : toPhotoError(error);
  }

  // 올린 순서는 사진마다 달라, 고른 순서로 돌려준다
  const order = new Map(targets.map(({ photoId }, index) => [photoId, index]));
  return uploaded.toSorted((first, second) => (order.get(first.photoId) ?? 0) - (order.get(second.photoId) ?? 0));
};

/**
 * 올린 사진의 원본·썸네일을 지운다. 사진 업로드 뒤 DB 행 저장이 실패했을 때 쓴다.
 *
 * @throws {Error} Storage가 삭제를 거부하면
 * @example await removeUploadedPhotos(supabase.storage.from(ALBUM_BUCKET), uploaded)
 */
export const removeUploadedPhotos = async (storage: PhotoStorage, photos: UploadedPhoto[]): Promise<void> => {
  if (photos.length === 0) return;

  const { error } = await storage.remove(photos.flatMap(({ path, thumbPath }) => [path, thumbPath]));
  if (error) throw new Error(`사진 파일을 지우지 못했습니다: ${error.message}`, { cause: error });
};
