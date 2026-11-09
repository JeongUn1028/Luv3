import "server-only";
import { isRecordId } from "@/lib/dates/detail";
import { createClient } from "@/lib/supabase/server";
import { toRecordComment, type RecordComment } from "./comment";

/** 기록의 댓글을 불러오지 못했을 때. 기록은 그대로 보여 주고 댓글 자리에만 안내한다 */
export class CommentLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("댓글을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "CommentLoadError";
  }
}

/**
 * 기록 하나의 댓글을 남긴 순서대로 작성자 닉네임과 함께 읽는다.
 *
 * @param memberId 지금 로그인한 사람. 이 사람이 쓴 댓글에 지우기를 붙인다
 * @returns id 형식이 틀리면 빈 목록(기록도 없어 화면은 찾을 수 없음으로 간다)
 * @throws {CommentLoadError} 조회가 실패했을 때
 * @example const comments = await getRecordComments({ recordId, memberId: member.id })
 */
export const getRecordComments = async ({ recordId, memberId }: { recordId: string; memberId: string }): Promise<RecordComment[]> => {
  if (!isRecordId(recordId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("comments")
    .select("id, content, created_at, author_id, author:members!comments_author_id_fkey(nickname)")
    .eq("date_id", recordId)
    .order("created_at")
    .order("id");
  if (error) throw new CommentLoadError({ cause: error });
  return data.map((row) => toRecordComment(row, memberId));
};
