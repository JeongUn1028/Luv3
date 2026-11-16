import "server-only";
import { isRecordId } from "@/lib/dates/record-href";
import { createClient } from "@/lib/supabase/server";
import type { CommentRow } from "./comment";

/** 기록의 댓글을 불러오지 못했을 때. 기록은 그대로 보여 주고 댓글 자리에만 안내한다 */
export class CommentLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("댓글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "CommentLoadError";
  }
}

/**
 * 기록 하나의 댓글을 남긴 순서대로 작성자 닉네임과 함께 읽는다.
 * 회원 확인과 함께 읽을 수 있게 행 그대로 돌려주고, 내 댓글 표시는 `toRecordComment`로 확인이 끝난 뒤 붙인다(#344).
 *
 * @returns id 형식이 틀리면 빈 목록(기록도 없어 화면은 찾을 수 없음으로 간다)
 * @throws {CommentLoadError} 조회가 실패했을 때
 * @example const rows = await getRecordComments(recordId); rows.map((row) => toRecordComment(row, member.id))
 */
export const getRecordComments = async (recordId: string): Promise<CommentRow[]> => {
  if (!isRecordId(recordId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, content, created_at, author_id, author:members!comments_author_id_fkey(nickname)")
    .eq("date_id", recordId)
    .order("created_at")
    .order("id");
  if (error) throw new CommentLoadError({ cause: error });
  return data;
};
