import { PhotoError } from "./errors";
import { PHOTO_CACHE_CONTROL, UPLOAD_CONTENT_TYPE } from "./limits";

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

/**
 * Storage 업로드 에러를 화면에 알릴 사진 에러로 바꾼다. 버킷 용량 제한이면 `too-large`, 아니면 `upload-failed`다.
 *
 * @example throw toPhotoError(error)
 */
export const toPhotoError = (error: unknown): PhotoError =>
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
