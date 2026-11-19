import { isDuplicateKey, type SaveErrorCode, type SaveOutcome } from "@/lib/save-outcome";
import { DB_ERROR_CODE } from "@/lib/supabase/error-codes";

/** 댓글 남기기 결과. `gone`은 기록이 지워져 남길 수 없다는 뜻이다. 응답이 끊겨도 같은 id로 다시 남기면 되므로 `failed`로 둔다 */
export type AddCommentOutcome = Extract<SaveOutcome, "saved" | "gone" | "failed">;

/** 댓글을 넣을 수 있는 표. Supabase의 `createClient().from("comments")`가 이 모양이다 */
export interface CommentInsertTable {
  insert: (row: { id: string; date_id: string; content: string }) => PromiseLike<{ error: SaveErrorCode | null }>;
}

interface AddCommentParams {
  /** 화면에 먼저 붙인 댓글. 다시 받은 목록에서도 같은 줄로 이어지게 같은 id로 저장한다 */
  comment: { id: string; recordId: string; content: string };
  comments: CommentInsertTable;
}

/**
 * 댓글을 남긴다. 응답만 끊겨 같은 id로 다시 남긴 경우(중복 키)는 이미 남은 것이므로 저장된 것으로 본다.
 *
 * @example const outcome = await addComment({ comment, comments: supabase.from("comments") })
 */
export const addComment = async ({ comment, comments }: AddCommentParams): Promise<AddCommentOutcome> => {
  const { error } = await comments.insert({ id: comment.id, date_id: comment.recordId, content: comment.content });
  if (!error || isDuplicateKey(error)) return "saved";
  // 쓰는 사이 상대가 기록을 지우면 없는 기록을 가리켜 외래 키 위반이 난다
  return error.code === DB_ERROR_CODE.foreignKeyViolation ? "gone" : "failed";
};
