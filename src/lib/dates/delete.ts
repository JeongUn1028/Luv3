import type { PhotoStorage } from "@/lib/photos/upload";

/** 기록을 지우지 못했을 때. `message`는 화면에 그대로 보여 줄 수 있다 */
export class DeleteDateRecordError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 지우지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "DeleteDateRecordError";
  }
}

export interface DeleteDateRecordParams {
  recordId: string;
  /** 그 기록 사진의 원본·썸네일 경로 전부 */
  filePaths: string[];
  storage: Pick<PhotoStorage, "remove">;
  /** `supabase.from("dates").delete().eq("id", recordId)`. 사진 행은 FK cascade로 함께 지워진다 */
  deleteRecord: (recordId: string) => PromiseLike<{ error: { message: string } | null }>;
}

/**
 * 기록을 지운다. DB 행을 지워도 Storage 파일은 남으므로 파일을 먼저 지우고 행을 지운다.
 * 행 삭제가 실패해도 다시 시도하면 된다(없는 파일 삭제는 오류가 아니다).
 *
 * @throws {DeleteDateRecordError} 파일이나 행을 지우지 못했을 때
 * @example
 * await deleteDateRecord({
 *   recordId, filePaths, storage: supabase.storage.from(ALBUM_BUCKET),
 *   deleteRecord: (id) => supabase.from("dates").delete().eq("id", id),
 * })
 */
export const deleteDateRecord = async ({
  recordId,
  filePaths,
  storage,
  deleteRecord,
}: DeleteDateRecordParams): Promise<void> => {
  if (filePaths.length > 0) {
    const { error } = await storage.remove(filePaths);
    if (error) throw new DeleteDateRecordError({ cause: error });
  }

  const { error } = await deleteRecord(recordId);
  if (error) throw new DeleteDateRecordError({ cause: error });
};
