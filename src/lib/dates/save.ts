import type { ResizedPhoto } from "@/lib/photos/resize";
import { removeUploadedPhotos, uploadPhotos, type PhotoStorage, type UploadedPhoto } from "@/lib/photos/upload";
import { toCreateRecordArgs, type CreateDateRecordArgs, type DateRecordDraft } from "./form";

/** 저장 단계: 사진 줄이기 → 올리기 → 기록 저장 */
export interface SaveProgress {
  step: "resizing" | "uploading" | "saving";
  done: number;
  total: number;
}

export interface SaveDateRecordParams {
  /** 새 기록 id. 업로드 경로와 `dates.id`에 같은 값을 쓴다 */
  recordId: string;
  draft: DateRecordDraft;
  /** 사진 id → 고른 파일 */
  files: ReadonlyMap<string, File>;
  storage: PhotoStorage;
  resize: (file: File) => Promise<ResizedPhoto>;
  /** `supabase.rpc("create_date_record", args)` */
  createRecord: (args: CreateDateRecordArgs) => PromiseLike<{ error: { message: string } | null }>;
  onProgress?: (progress: SaveProgress) => void;
}

/** 사진은 올렸지만 기록을 저장하지 못했을 때. `message`는 화면에 그대로 보여 줄 수 있다 */
export class SaveDateRecordError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "SaveDateRecordError";
  }
}

/**
 * 기록 하나를 저장한다: 사진을 한 장씩 줄이고(메모리 절약), 모두 올린 뒤, 기록·사진 행을 한 번에 만든다.
 * 행 저장이 실패하면 올린 사진을 지워 Storage에 주인 없는 파일을 남기지 않는다(#5에서 정한 순서).
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
}: SaveDateRecordParams): Promise<void> => {
  const args = toCreateRecordArgs(recordId, draft);
  const photoFiles = draft.photos.map(({ id }) => {
    const file = files.get(id);
    if (!file) throw new Error(`고른 사진의 파일이 없습니다: ${id}`);
    return { id, file };
  });

  const uploaded = await uploadNewPhotos({ recordId, photoFiles, storage, resize, onProgress });

  onProgress?.({ step: "saving", done: photoFiles.length, total: photoFiles.length });
  const { error } = await createRecord(args);
  if (error) {
    // 정리가 실패해도 사용자에게는 저장 실패를 알리는 게 맞아 정리 에러는 삼킨다(고아 파일 정리는 #31)
    await removeUploadedPhotos(storage, uploaded).catch(() => undefined);
    throw new SaveDateRecordError({ cause: error });
  }
};

export interface UpdateDateRecordParams extends Omit<SaveDateRecordParams, "files" | "createRecord"> {
  /** 이번에 새로 고른 사진의 id → 파일. 이미 저장된 사진은 넣지 않는다 */
  files: ReadonlyMap<string, File>;
  /** `supabase.rpc("update_date_record", args)`. 뺀 사진의 파일 경로를 돌려준다 */
  updateRecord: (
    args: CreateDateRecordArgs,
  ) => PromiseLike<{ data: string[] | null; error: { message: string } | null }>;
}

/**
 * 기록을 고친다: 새로 고른 사진만 줄여 올리고, 기록·사진 행을 한 번에 고친 뒤, 뺀 사진의 파일을 지운다.
 * 행 수정이 실패하면 새로 올린 사진만 지운다(기존 사진은 기록이 그대로라 남겨 둔다).
 *
 * @throws {PhotoError} 새 사진을 줄이거나 올리지 못했을 때(기록은 바뀌지 않는다)
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
  const args = toCreateRecordArgs(recordId, draft);
  const photoFiles = draft.photos.flatMap(({ id }) => {
    const file = files.get(id);
    return file ? [{ id, file }] : [];
  });

  const uploaded = await uploadNewPhotos({ recordId, photoFiles, storage, resize, onProgress });

  onProgress?.({ step: "saving", done: photoFiles.length, total: photoFiles.length });
  const { data: removedPaths, error } = await updateRecord(args);
  if (error) {
    await removeUploadedPhotos(storage, uploaded).catch(() => undefined);
    throw new SaveDateRecordError({ cause: error });
  }

  // 기록은 이미 고쳐졌으므로 파일 정리가 실패해도 수정 실패로 알리지 않는다(남은 파일은 #31에서 정리)
  if (removedPaths && removedPaths.length > 0) {
    await storage.remove(removedPaths).catch(() => undefined);
  }
};

interface UploadNewPhotosParams extends Pick<SaveDateRecordParams, "storage" | "resize" | "onProgress"> {
  recordId: string;
  photoFiles: { id: string; file: File }[];
}

/** 사진을 한 장씩 줄이고(메모리 절약) 모두 올린다. 올릴 사진이 없으면 아무것도 하지 않는다 */
const uploadNewPhotos = async ({
  recordId,
  photoFiles,
  storage,
  resize,
  onProgress,
}: UploadNewPhotosParams): Promise<UploadedPhoto[]> => {
  const total = photoFiles.length;
  if (total === 0) return [];

  const resized = [];
  for (const [index, { id, file }] of photoFiles.entries()) {
    onProgress?.({ step: "resizing", done: index, total });
    resized.push({ photoId: id, ...(await resize(file)) });
  }

  onProgress?.({ step: "uploading", done: 0, total });
  return uploadPhotos({
    storage,
    dateId: recordId,
    photos: resized,
    onProgress: (done) => onProgress?.({ step: "uploading", done, total }),
  });
};
