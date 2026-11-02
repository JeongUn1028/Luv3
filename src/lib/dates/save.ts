import type { ResizedPhoto } from "@/lib/photos/resize";
import { removeUploadedPhotos, uploadPhotos, type PhotoStorage } from "@/lib/photos/upload";
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
  const total = draft.photos.length;
  const args = toCreateRecordArgs(recordId, draft);
  const photoFiles = draft.photos.map(({ id }) => {
    const file = files.get(id);
    if (!file) throw new Error(`고른 사진의 파일이 없습니다: ${id}`);
    return { id, file };
  });

  const resized = [];
  for (const [index, { id, file }] of photoFiles.entries()) {
    onProgress?.({ step: "resizing", done: index, total });
    resized.push({ photoId: id, ...(await resize(file)) });
  }

  onProgress?.({ step: "uploading", done: 0, total });
  const uploaded = await uploadPhotos({
    storage,
    dateId: recordId,
    photos: resized,
    onProgress: (done) => onProgress?.({ step: "uploading", done, total }),
  });

  onProgress?.({ step: "saving", done: total, total });
  const { error } = await createRecord(args);
  if (error) {
    // 정리가 실패해도 사용자에게는 저장 실패를 알리는 게 맞아 정리 에러는 삼킨다(고아 파일 정리는 #31)
    await removeUploadedPhotos(storage, uploaded).catch(() => undefined);
    throw new SaveDateRecordError({ cause: error });
  }
};
