"use client";

import { useRouter } from "next/navigation";
import { startTransition, useOptimistic, useRef, useState, type ReactElement } from "react";
import { AuthorTag } from "@/components/AuthorTag";
import { CommentForm } from "@/components/dates/CommentForm";
import { ModalActions, ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { COMMENTS_HEADING_ID } from "@/lib/comments/comment";
import { applyCommentAction, type ShownComment } from "@/lib/comments/thread";
import { refreshOutsideForm } from "@/lib/navigation/refresh-outside-form";
import { useLeavableDelete } from "@/lib/navigation/use-leavable-delete";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { createClient } from "@/lib/supabase/client";

const DELETE_FAILED_MESSAGE = "댓글을 지우지 못했어요. 잠시 후 다시 시도해 주세요.";

interface CommentsHeadingProps {
  /** 불러오지 못했으면 undefined. 0이면 개수를 붙이지 않는다 */
  count: number | undefined;
}

/**
 * 댓글 제목. 댓글을 지우면 초점을 이리로 옮긴다.
 *
 * @example <CommentsHeading count={comments.length} />
 */
export const CommentsHeading = ({ count }: CommentsHeadingProps): ReactElement => (
  <h2 id={COMMENTS_HEADING_ID} tabIndex={-1} className="font-display text-[15px] tracking-[3px] text-label focus:outline-none">
    댓글
    {count !== undefined && count > 0 && <span className="ml-1.5 text-ink-sub">{count}</span>}
  </h2>
);

interface CommentThreadProps {
  recordId: string;
  /** 서버에서 읽은 댓글(남긴 순서) */
  comments: ShownComment[];
  /** 지금 로그인한 사람. 남기는 댓글에 먼저 붙일 이름표다 */
  memberNickname: string;
}

/**
 * 댓글 제목·목록·입력 칸. 남기기와 지우기는 저장을 기다리지 않고 목록에 먼저 반영하고,
 * 저장이 끝나면 서버 목록으로 다시 맞춘다. 실패하면 먼저 바꾼 목록은 저절로 되돌아간다.
 *
 * @example <CommentThread recordId={record.id} comments={shownComments} memberNickname={member.nickname} />
 */
export const CommentThread = ({ recordId, comments, memberNickname }: CommentThreadProps): ReactElement => {
  const router = useRouter();
  const [shownComments, applyOptimisticAction] = useOptimistic(comments, applyCommentAction);
  const [deleteNotice, setDeleteNotice] = useState<string>();
  useResetOnHide(() => setDeleteNotice(undefined));
  const modalRef = useRef<ModalDialogHandle>(null);
  const deletingIdRef = useRef<string>(undefined);
  // 지운 댓글과 함께 연 버튼이 사라져, 창이 닫히면 초점이 문서 처음으로 간다
  const shouldFocusHeadingRef = useRef(false);
  const { beginDelete, finishDeleted, finishDeleteFailed } = useLeavableDelete({ noticeKey: `delete:comment:${recordId}`, subject: "댓글을" });
  const isSending = shownComments.some((comment) => comment.isSending);

  const handleOpenDelete = (commentId: string) => {
    deletingIdRef.current = commentId;
    modalRef.current?.open();
  };

  const handleConfirmDelete = () => {
    const commentId = deletingIdRef.current;
    if (!commentId) return;
    deletingIdRef.current = undefined;
    shouldFocusHeadingRef.current = true;
    setDeleteNotice(undefined);
    beginDelete();
    startTransition(async () => {
      applyOptimisticAction({ type: "remove", id: commentId });
      // 다른 기기에서 이미 지운 댓글이면 0행이 지워진다. 목록을 새로 받으면 사라지므로 실패로 보지 않는다
      const { error } = await createClient().from("comments").delete().eq("id", commentId);
      if (error) {
        // 사용자에게는 다시 시도할 수 있다는 문구만 보여 주고, 원인은 개발자 도구에서 볼 수 있게 남긴다
        console.error(new Error(`댓글을 지우지 못했습니다: ${error.message}`, { cause: error }));
        // 지운 댓글은 저절로 다시 나타난다. 세션이 끊겼을 때 새로 받으면 로그인 화면으로 넘어가 다시 로그인 창이 소용없어진다(#102)
        if (finishDeleteFailed(true)) setDeleteNotice(DELETE_FAILED_MESSAGE);
        return;
      }
      // 화면을 떠났으면 알림과 새로 받기는 도우미가 맡는다(#261)
      if (!finishDeleted()) return;
      // await 뒤의 갱신은 다시 transition으로 감싸야 새 목록이 올 때까지 지운 댓글이 다시 보이지 않는다
      refreshOutsideForm(() => startTransition(() => router.refresh()));
    });
    // 목록에서 먼저 빼는 것을 시작한 뒤 닫는다. 움직임 없이 바로 닫혀도 사라질 버튼으로 초점이 돌아가지 않게 한다
    modalRef.current?.close();
  };

  const handleDialogClose = () => {
    deletingIdRef.current = undefined;
    if (!shouldFocusHeadingRef.current) return;
    shouldFocusHeadingRef.current = false;
    // 화면 읽기 프로그램이 자리를 잃지 않게 댓글 제목으로 옮긴다. 지우기 실패 안내도 바로 아래에 있다
    requestAnimationFrame(() => {
      if (document.activeElement === null || document.activeElement === document.body) document.getElementById(COMMENTS_HEADING_ID)?.focus();
    });
  };

  return (
    <>
      <CommentsHeading count={shownComments.length} />
      {deleteNotice && (
        <p role="alert" className="mt-2 text-[13px] text-accent">
          {deleteNotice}
        </p>
      )}
      {shownComments.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-sub">아직 댓글이 없어요.</p>
      ) : (
        <ul aria-label="댓글 목록" className="mt-1 flex flex-col divide-y divide-line">
          {shownComments.map(({ id, content, createdAt, timeLabel, authorNickname, isMine, isSending: isCommentSending }) => (
            <li key={id} className="flex flex-col gap-1.5 py-3.5">
              <div className="flex min-h-[22px] items-center justify-between gap-3">
                <p className="flex min-w-0 items-center gap-2 text-[12px] text-ink-sub">
                  {authorNickname && <AuthorTag nickname={authorNickname} />}
                  {isCommentSending ? (
                    <span className="truncate">남기는 중…</span>
                  ) : (
                    <time dateTime={createdAt} className="truncate">
                      {timeLabel}
                    </time>
                  )}
                </p>
                {/* 저장이 끝나야 지울 댓글이 DB에 있다 */}
                {isMine && !isCommentSending && (
                  <button
                    type="button"
                    onClick={() => handleOpenDelete(id)}
                    aria-label="댓글 삭제"
                    className="press-icon -my-3 -mr-3 h-11 px-3 text-[13px] text-ink-sub hover:text-ink"
                  >
                    삭제
                  </button>
                )}
              </div>
              <p className="text-[15px] leading-[1.6] break-words whitespace-pre-wrap text-ink">{content}</p>
            </li>
          ))}
        </ul>
      )}
      <CommentForm recordId={recordId} memberNickname={memberNickname} isSending={isSending} onOptimisticAction={applyOptimisticAction} />
      <ModalDialog ref={modalRef} title="이 댓글을 지울까요?" description="두 사람 화면에서 모두 지워지고 되돌릴 수 없어요." onClose={handleDialogClose}>
        <ModalActions cancelLabel="취소" onCancel={() => modalRef.current?.close()} confirmLabel="삭제" onConfirm={handleConfirmDelete} />
      </ModalDialog>
    </>
  );
};
