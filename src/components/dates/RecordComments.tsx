import type { ReactElement } from "react";
import { CommentsHeading, CommentThread } from "@/components/dates/CommentThread";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { COMMENTS_HEADING_ID, type RecordComment } from "@/lib/comments/comment";
import { CommentLoadError } from "@/lib/comments/queries";
import { toShownComments } from "@/lib/comments/thread";

interface RecordCommentsProps {
  recordId: string;
  /** 남긴 순서의 댓글. 불러오지 못했으면 그 에러 */
  comments: RecordComment[] | CommentLoadError;
  /** 지금 로그인한 사람. 남기는 댓글에 먼저 붙일 이름표다 */
  memberNickname: string;
}

/**
 * 기록 상세 아래의 댓글 목록과 입력 칸. 댓글을 불러오지 못해도 기록은 그대로 두고 이 자리에서만 다시 불러오게 한다.
 * 쿠키를 읽은 뒤의 요청 안에서만 그린다(지금 시각으로 연도 표시를 정한다).
 *
 * @example <RecordComments recordId={record.id} comments={comments} memberNickname={member.nickname} />
 */
export const RecordComments = ({ recordId, comments, memberNickname }: RecordCommentsProps): ReactElement => (
  <section aria-labelledby={COMMENTS_HEADING_ID} className="mt-8 flex flex-col border-t border-line px-4 pt-6">
    {comments instanceof CommentLoadError ? (
      <>
        <CommentsHeading count={undefined} />
        <LoadErrorMessage message={comments.message} />
      </>
    ) : (
      <CommentThread recordId={recordId} comments={toShownComments(comments, new Date())} memberNickname={memberNickname} />
    )}
  </section>
);
