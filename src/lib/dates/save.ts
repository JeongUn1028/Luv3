import type { ResizedPhoto } from "@/lib/photos/resize";
import { removeUploadedPhotos, resizeAndUploadPhotos, type UploadedPhoto } from "@/lib/photos/upload";
import type { PhotoStorage } from "@/lib/photos/upload-file";
import { callWithRetry, isDuplicateKey, isOutcomeUnknown } from "@/lib/save-outcome";
import { toCreateRecordArgs, type CreateDateRecordArgs, type DateRecordDraft, type UpdateDateRecordArgs } from "./form";
import { getDraftPhotos } from "./photo-group-draft";
import { DateRecordAlreadyLinkedError, DateRecordConflictError, DateRecordGoneError, SaveDateRecordError } from "./save-errors";

/** 저장 단계: 사진 올리기(줄이며 올린다) → 기록 저장. `done`은 원본·썸네일까지 다 올린 장수다(#312) */
export interface SaveProgress {
  step: "uploading" | "saving";
  done: number;
  total: number;
}

/** `update_date_record`가 없는 기록(허용목록 밖이라 보이지 않는 기록 포함)에 내는 오류 코드 */
const RECORD_NOT_FOUND_CODE = "P0002";

/** 화면을 연 뒤 기록이 바뀌어 `update_date_record`가 저장을 거부했을 때 */
const RECORD_CONFLICT_CODE = "P0409";

/** 그 일정의 그날에 이미 남긴 기록이 있어 `create_date_record`가 거부했을 때. `details`에 그 기록 id가 온다 */
const EVENT_LINK_TAKEN_CODE = "P0410";

const UNCERTAIN_SAVE_MESSAGE = "저장됐는지 확인하지 못했어요. 다시 저장해도 기록이 둘이 되지는 않아요.";

interface RecordRpcError {
  message: string;
  code?: string;
  details?: string;
}

/** `already-saved`면 앞선 시도가 저장한 기록이 이미 있어 이번 내용은 반영하지 않았다 */
export type SaveDateRecordResult = "saved" | "already-saved";

export interface SaveDateRecordParams {
  /** 새 기록 id. 업로드 경로와 `dates.id`에 같은 값을 쓴다. `draft.uncertainSaveRecordId`가 있으면 그 값을 넘긴다 */
  recordId: string;
  draft: DateRecordDraft;
  /** 사진 id → 고른 파일 */
  files: ReadonlyMap<string, File>;
  storage: PhotoStorage;
  resize: (file: File) => Promise<ResizedPhoto>;
  /** `supabase.rpc("create_date_record", args)` */
  createRecord: (args: CreateDateRecordArgs) => PromiseLike<{ error: RecordRpcError | null }>;
  onProgress?: (progress: SaveProgress) => void;
}

/**
 * 기록 하나를 저장한다: 사진을 줄이는 대로 올리고(`resizeAndUploadPhotos`), 모두 올린 뒤 기록·사진 행을 한 번에 만든다.
 * 응답만 끊기면 한 번 더 보내고, 그래도 모르면 저장됐을 수 있어 사진을 남긴다(남은 파일은 #31에서 정리한다).
 * 앞선 시도가 이미 저장했으면 `already-saved`를 돌려준다. 같은 폼으로 새로 쓴 내용이 앞선 기록을 덮어 사진을 지우지 않도록 고치지 않으므로,
 * 호출하는 쪽이 저장된 기록을 보여 줘 사용자가 확인하게 한다.
 * 서버가 분명히 거절하면 올린 사진을 지워 Storage에 주인 없는 파일을 남기지 않는다(#5에서 정한 순서).
 *
 * @throws {PhotoError} 사진을 줄이거나 올리지 못했을 때(아무 행도 만들지 않는다)
 * @throws {SaveDateRecordError} 기록 행을 저장하지 못했을 때
 * @example
 * await saveDateRecord({
 *   recordId: crypto.randomUUID(), draft, files,
 *   storage: supabase.storage.from(ALBUM_BUCKET), resize: resizePhoto,
 *   createRecord: (args) => supabase.rpc("create_date_record", args),
 * })
 */
export const saveDateRecord = async ({
  recordId,
  draft,
  files,
  storage,
  resize,
  createRecord,
  onProgress,
}: SaveDateRecordParams): Promise<SaveDateRecordResult> => {
  const mayAlreadyBeSaved = draft.uncertainSaveRecordId !== undefined;
  const args = toCreateRecordArgs(recordId, draft);
  const photoFiles = getDraftPhotos(draft.groups).map(({ id }) => {
    const file = files.get(id);
    if (!file) throw new Error(`고른 사진의 파일이 없습니다: ${id}`);
    return { id, file };
  });

  const uploaded = await uploadNewPhotos({ recordId, photoFiles, storage, resize, mayAlreadyExist: mayAlreadyBeSaved, onProgress });

  onProgress?.({ step: "saving", done: photoFiles.length, total: photoFiles.length });
  const { error, mayHaveApplied } = await callWithRetry(() => createRecord(args));
  if (!error) return "saved";

  const mayHaveSaved = mayAlreadyBeSaved || mayHaveApplied || isOutcomeUnknown(error);
  if (mayHaveSaved && isDuplicateKey(error)) return "already-saved";
  if (!mayHaveSaved) await discardUploadedPhotos(storage, uploaded);
  // 같은 id가 이미 있으면 DB 함수가 23505를 먼저 알리므로, 이번 id는 저장되지 않았다
  if (error.code === EVENT_LINK_TAKEN_CODE) throw new DateRecordAlreadyLinkedError(error.details, { cause: error });
  throw toSaveError(error, mayHaveSaved);
};

export interface UpdateDateRecordParams extends Omit<SaveDateRecordParams, "files" | "createRecord"> {
  /** 이번에 새로 고른 사진의 id → 파일. 이미 저장된 사진은 넣지 않는다 */
  files: ReadonlyMap<string, File>;
  /** `supabase.rpc("update_date_record", args)`. 뺀 사진의 파일 경로를 돌려준다 */
  updateRecord: (args: UpdateDateRecordArgs) => PromiseLike<{ data: string[] | null; error: RecordRpcError | null }>;
}

/**
 * 기록을 고친다: 새로 고른 사진만 줄여 올리고, 기록·사진 행을 한 번에 고친 뒤, 뺀 사진의 파일을 지운다.
 * 응답만 끊기면 한 번 더 보내고, 그래도 모르면 고쳐졌을 수 있어 새 사진을 남긴다.
 * 첫 응답을 잃으면 뺀 사진의 경로도 함께 잃어 그 파일이 남는다(#31에서 정리한다).
 * 서버가 분명히 거절하면 새로 올린 사진만 지운다(기존 사진은 기록이 그대로라 남겨 둔다).
 *
 * @throws {PhotoError} 새 사진을 줄이거나 올리지 못했을 때(기록은 바뀌지 않는다)
 * @throws {DateRecordGoneError} 고치는 사이 상대가 기록을 지웠을 때
 * @throws {DateRecordConflictError} 고치는 사이 상대가 기록을 고쳤을 때(이번 시도는 반영되지 않는다)
 * @throws {SaveDateRecordError} 기록 행을 고치지 못했을 때
 * @example
 * await updateDateRecord({
 *   recordId, draft, files: newFiles, storage: supabase.storage.from(ALBUM_BUCKET), resize: resizePhoto,
 *   updateRecord: (args) => supabase.rpc("update_date_record", args),
 * })
 */
export const updateDateRecord = async ({
  recordId,
  draft,
  files,
  storage,
  resize,
  updateRecord,
  onProgress,
}: UpdateDateRecordParams): Promise<void> => {
  const mayAlreadyBeSaved = draft.uncertainSaveRecordId !== undefined;
  // 일정 연결은 새 기록에만 정하고 `update_date_record`는 받지 않는다
  const args = {
    ...toCreateRecordArgs(recordId, { ...draft, eventLink: undefined }),
    p_expected_revisions: draft.expectedRevisions,
    p_new_revision: draft.nextRevision,
  };
  const photoFiles = getDraftPhotos(draft.groups).flatMap(({ id }) => {
    const file = files.get(id);
    return file ? [{ id, file }] : [];
  });

  const uploaded = await uploadNewPhotos({ recordId, photoFiles, storage, resize, mayAlreadyExist: mayAlreadyBeSaved, onProgress });

  onProgress?.({ step: "saving", done: photoFiles.length, total: photoFiles.length });
  const { error, mayHaveApplied } = await callWithRetry(() => updateRecord(args));
  if (error) {
    if (error.code === RECORD_NOT_FOUND_CODE) {
      await discardUploadedPhotos(storage, uploaded);
      throw new DateRecordGoneError({ cause: error });
    }
    const mayHaveSaved = mayAlreadyBeSaved || mayHaveApplied || isOutcomeUnknown(error);
    if (!mayHaveSaved) await discardUploadedPhotos(storage, uploaded);
    if (error.code === RECORD_CONFLICT_CODE) throw new DateRecordConflictError({ cause: error, mayHaveSaved });
    throw toSaveError(error, mayHaveSaved);
  }
  // 뺀 사진의 파일은 지우지 않는다. DB가 휴지통에 남기고 매달 정리 작업이 30일 뒤 지운다(#311)
};

/** 저장되지 않은 것이 분명할 때 올린 사진을 지운다. 정리가 실패해도 사용자에게는 저장 실패를 알리는 게 맞아 정리 에러는 삼킨다 */
const discardUploadedPhotos = (storage: PhotoStorage, uploaded: UploadedPhoto[]): Promise<void> =>
  removeUploadedPhotos(storage, uploaded).catch(() => undefined);

const toSaveError = (error: RecordRpcError, mayHaveSaved: boolean): SaveDateRecordError =>
  mayHaveSaved ? new SaveDateRecordError({ cause: error, mayHaveSaved }, UNCERTAIN_SAVE_MESSAGE) : new SaveDateRecordError({ cause: error });

interface UploadNewPhotosParams extends Pick<SaveDateRecordParams, "storage" | "resize" | "onProgress"> {
  recordId: string;
  mayAlreadyExist: boolean;
  photoFiles: { id: string; file: File }[];
}

/** 사진을 줄이는 대로 올린다. 올릴 사진이 없으면 아무것도 하지 않는다 */
const uploadNewPhotos = async ({
  recordId,
  photoFiles,
  storage,
  resize,
  mayAlreadyExist,
  onProgress,
}: UploadNewPhotosParams): Promise<UploadedPhoto[]> => {
  const total = photoFiles.length;
  if (total === 0) return [];

  onProgress?.({ step: "uploading", done: 0, total });
  return resizeAndUploadPhotos({
    storage,
    dateId: recordId,
    photos: photoFiles.map(({ id, file }) => ({ photoId: id, file })),
    resize,
    mayAlreadyExist,
    onProgress: (done) => onProgress?.({ step: "uploading", done, total }),
  });
};
