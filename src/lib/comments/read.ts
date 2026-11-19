import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/guards";
import type { Database } from "@/lib/supabase/database.types";
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
 * 서버(상세를 처음 그릴 때)와 브라우저(댓글을 남기거나 지운 뒤 댓글만 다시 읽을 때, #355)가 같은 조회를 쓴다.
 *
 * @returns id 형식이 틀리면 묻지 않고 빈 목록(기록도 없어 화면은 찾을 수 없음으로 간다)
 * @throws {CommentLoadError} 조회가 실패했을 때
 * @example const rows = await readRecordComments(createClient(), recordId)
 */
export const readRecordComments = async (supabase: SupabaseClient<Database>, recordId: string): Promise<CommentRow[]> => {
  if (!isUuid(recordId)) return [];
  const { data, error } = await supabase
    .from("comments")
    .select("id, content, created_at, author_id, author:members!comments_author_id_fkey(nickname)")
    .eq("date_id", recordId)
    .order("created_at")
    .order("id");
  if (error) throw new CommentLoadError({ cause: error });
  return data;
};
