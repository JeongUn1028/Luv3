import { PhotoError } from "./errors";
import { UPLOAD_CONTENT_TYPE } from "./limits";
import { buildPhotoPaths, type PhotoPaths } from "./paths";

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
    options: { contentType: string; upsert: boolean },
  ) => Promise<StorageResult>;
  remove: (paths: string[]) => Promise<StorageResult>;
}

export interface PhotoToUpload {
  /** 새 사진 행의 id. 업로드 전에 `crypto.randomUUID()`로 정해 두고 `photos.id`에도 같은 값을 쓴다 */
  photoId: string;
  original: Blob;
  thumb: Blob;
}

export interface UploadedPhoto extends PhotoPaths {
  photoId: string;
}

export interface UploadPhotosParams {
  storage: PhotoStorage;
  /** 사진이 속할 기록의 id. `dates.id`에도 같은 값을 쓴다 */
  dateId: string;
  photos: PhotoToUpload[];
  /** 사진 한 장(원본+썸네일)을 올릴 때마다 (올린 장수, 전체 장수)로 불린다 */
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

/**
 * 파일 하나를 album 버킷의 `path`에 올린다(덮어쓰지 않음). 일시적인 실패면 한 번 더 시도한다.
 * 실패해도 이 함수는 파일을 지우지 않으므로, 응답만 끊기고 저장됐을 수 있는 `path`는 호출한 쪽이 정리한다.
 *
 * @throws {PhotoError} `upload-failed` 또는 버킷 용량 제한에 걸리면 `too-large`
 * @example await uploadPhotoFile(supabase.storage.from(ALBUM_BUCKET), buildCouplePhotoPath(photoId), original)
 */
export const uploadPhotoFile = async (storage: PhotoStorage, path: string, body: Blob): Promise<void> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const { error } = await storage.upload(path, body, { contentType: UPLOAD_CONTENT_TYPE, upsert: false });
      if (!error) return;
      lastError = error;
    } catch (error) {
      lastError = error;
    }
    // 사진 id는 새로 만든 UUID라, 다시 보냈을 때의 중복은 응답만 끊기고 첫 요청이 저장됐다는 뜻이다
    if (attempt > 1 && hasStatusCode(lastError, 409)) return;
    if (!isRetryable(lastError)) break;
  }

  throw toPhotoError(lastError);
};

/**
 * 줄인 사진들을 album 버킷의 `{date_id}/{photo_id}.jpg`, `{date_id}/{photo_id}_thumb.jpg`에 차례로 올린다.
 * 파일마다 한 번 더 시도하고, 그래도 실패하면 이번에 올리려던 파일을 모두 지운 뒤 에러를 낸다.
 * 사진이 빠진 기록이 생기지 않도록, DB 행은 이 함수가 끝난 뒤에 만들고 행 저장이 실패하면 `removeUploadedPhotos`로 지운다.
 *
 * @throws {PhotoError} `upload-failed` 또는 버킷 용량 제한에 걸리면 `too-large`
 * @throws {Error} 기록·사진 id가 UUID가 아니면(아무것도 올리지 않는다)
 * @example
 * const uploaded = await uploadPhotos({
 *   storage: supabase.storage.from(ALBUM_BUCKET),
 *   dateId,
 *   photos: [{ photoId: crypto.randomUUID(), ...(await resizePhoto(file)) }],
 *   onProgress: (done, total) => setProgress(done / total),
 * })
 */
export const uploadPhotos = async ({
  storage,
  dateId,
  photos,
  onProgress,
}: UploadPhotosParams): Promise<UploadedPhoto[]> => {
  // id 형식 오류는 코드 실수라, 일부를 올린 뒤 "다시 시도해 주세요"로 감추지 않도록 올리기 전에 모두 확인한다
  const targets = photos.map((photo) => ({ ...photo, ...buildPhotoPaths(dateId, photo.photoId) }));
  const uploaded: UploadedPhoto[] = [];
  // 응답만 끊기고 저장된 파일도 지우도록, 성공한 경로가 아니라 시도한 경로를 모은다
  const attemptedPaths: string[] = [];

  try {
    for (const { photoId, original, thumb, path, thumbPath } of targets) {
      attemptedPaths.push(path);
      await uploadPhotoFile(storage, path, original);
      attemptedPaths.push(thumbPath);
      await uploadPhotoFile(storage, thumbPath, thumb);

      uploaded.push({ photoId, path, thumbPath });
      onProgress?.(uploaded.length, targets.length);
    }
  } catch (error) {
    if (attemptedPaths.length > 0) {
      // 정리가 실패하면 파일이 남지만, 사용자에게는 원래 실패 이유를 알리는 게 맞아 여기서는 삼킨다
      await storage.remove(attemptedPaths).catch(() => undefined);
    }
    throw error instanceof PhotoError ? error : toPhotoError(error);
  }

  return uploaded;
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
