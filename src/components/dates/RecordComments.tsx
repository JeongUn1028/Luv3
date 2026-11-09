import type { ReactElement } from "react";
import { AuthorTag } from "@/components/AuthorTag";
import { CommentForm } from "@/components/dates/CommentForm";
import { DeleteCommentButton } from "@/components/dates/DeleteCommentButton";
import { LoadErrorMessage } from "@/components/LoadErrorMessage";
import { COMMENTS_HEADING_ID, formatCommentTime, type RecordComment } from "@/lib/comments/comment";
import { CommentLoadError } from "@/lib/comments/queries";

interface RecordCommentsProps {
  recordId: string;
  /** 남긴 순서의 댓글. 불러오지 못했으면 그 에러 */
  comments: RecordComment[] | CommentLoadError;
}

/**
 * 기록 상세 아래의 댓글 목록과 입력 칸. 댓글을 불러오지 못해도 기록은 그대로 두고 이 자리에서만 다시 불러오게 한다.
 * 쿠키를 읽은 뒤의 요청 안에서만 그린다(지금 시각으로 연도 표시를 정한다).
 *
 * @example <RecordComments recordId={record.id} comments={comments} />
 */
export const RecordComments = ({ recordId, comments }: RecordCommentsProps): ReactElement => {
  const now = new Date();

  return (
    <section aria-labelledby={COMMENTS_HEADING_ID} className="mt-8 flex flex-col border-t border-line px-4 pt-6">
      {/* 댓글을 지우면 초점을 이리로 옮긴다 */}
      <h2 id={COMMENTS_HEADING_ID} tabIndex={-1} className="font-display text-[15px] tracking-[3px] text-label focus:outline-none">
        댓글
        {!(comments instanceof CommentLoadError) && comments.length > 0 && <span className="ml-1.5 text-ink-sub">{comments.length}</span>}
      </h2>
      {comments instanceof CommentLoadError ? (
        <LoadErrorMessage message={comments.message} />
      ) : (
        <>
          {comments.length === 0 ? (
            <p className="mt-3 text-[13px] text-ink-sub">아직 댓글이 없어요.</p>
          ) : (
            <ul aria-label="댓글 목록" className="mt-1 flex flex-col divide-y divide-line">
              {comments.map(({ id, content, createdAt, authorNickname, isMine }) => (
                <li key={id} className="flex flex-col gap-1.5 py-3.5">
                  <div className="flex min-h-[22px] items-center justify-between gap-3">
                    <p className="flex min-w-0 items-center gap-2 text-[12px] text-ink-sub">
                      {authorNickname && <AuthorTag nickname={authorNickname} />}
                      <time dateTime={createdAt} className="truncate">
                        {formatCommentTime(createdAt, now)}
                      </time>
                    </p>
                    {isMine && <DeleteCommentButton commentId={id} />}
                  </div>
                  <p className="text-[15px] leading-[1.6] break-words whitespace-pre-wrap text-ink">{content}</p>
                </li>
              ))}
            </ul>
          )}
          <CommentForm recordId={recordId} />
        </>
      )}
    </section>
  );
};
