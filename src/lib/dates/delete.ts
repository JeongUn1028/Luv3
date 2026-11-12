/** 기록을 지우지 못했을 때. `message`는 화면에 그대로 보여 줄 수 있다 */
export class DeleteDateRecordError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 지우지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "DeleteDateRecordError";
  }
}

export interface DeleteDateRecordParams {
  recordId: string;
  /** `supabase.from("dates").delete().eq("id", recordId)`. 사진 행은 FK cascade로 함께 지워진다 */
  deleteRecord: (recordId: string) => PromiseLike<{ error: { message: string } | null }>;
}

/**
 * 기록을 지운다. 사진 파일은 지우지 않는다. DB가 지운 사진을 휴지통(`photo_trash`)에 남기고,
 * 매달 정리 작업이 보관 기간(30일)이 지난 파일만 지운다(#311).
 *
 * @throws {DeleteDateRecordError} 행을 지우지 못했을 때
 * @example
 * await deleteDateRecord({ recordId, deleteRecord: (id) => supabase.from("dates").delete().eq("id", id) })
 */
export const deleteDateRecord = async ({ recordId, deleteRecord }: DeleteDateRecordParams): Promise<void> => {
  const { error } = await deleteRecord(recordId);
  if (error) throw new DeleteDateRecordError({ cause: error });
};
