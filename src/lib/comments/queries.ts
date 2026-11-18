import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CommentRow } from "./comment";
import { readRecordComments } from "./read";

/**
 * 기록 하나의 댓글을 남긴 순서대로 작성자 닉네임과 함께 읽는다.
 * 회원 확인과 함께 읽을 수 있게 행 그대로 돌려주고, 내 댓글 표시는 `toRecordComment`로 확인이 끝난 뒤 붙인다(#344).
 *
 * @returns id 형식이 틀리면 빈 목록(기록도 없어 화면은 찾을 수 없음으로 간다)
 * @throws {CommentLoadError} 조회가 실패했을 때
 * @example const rows = await getRecordComments(recordId); rows.map((row) => toRecordComment(row, member.id))
 */
export const getRecordComments = async (recordId: string): Promise<CommentRow[]> => readRecordComments(await createClient(), recordId);
