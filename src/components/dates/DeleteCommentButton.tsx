"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, type ReactElement } from "react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { COMMENTS_HEADING_ID } from "@/lib/comments/comment";
import { createClient } from "@/lib/supabase/client";

interface DeleteCommentButtonProps {
  commentId: string;
}

/** 내가 쓴 댓글의 삭제 버튼과 확인 창. 지우면 기록 화면을 새로 받아 목록에서 뺀다 */
export const DeleteCommentButton = ({ commentId }: DeleteCommentButtonProps): ReactElement => {
  const router = useRouter();
  const isDeletedRef = useRef(false);

  useEffect(
    () => () => {
      // 지운 댓글과 함께 버튼과 확인 창이 사라져 초점이 문서 처음으로 간다. 화면 읽기 프로그램이 자리를 잃지 않게 댓글 제목으로 옮긴다
      if (!isDeletedRef.current) return;
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) document.getElementById(COMMENTS_HEADING_ID)?.focus();
      });
    },
    [],
  );

  const handleConfirm = async () => {
    // 다른 기기에서 이미 지운 댓글이면 0행이 지워진다. 목록을 새로 받으면 사라지므로 실패로 보지 않는다
    const { error } = await createClient().from("comments").delete().eq("id", commentId);
    if (error) throw new Error(`댓글을 지우지 못했습니다: ${error.message}`, { cause: error });
  };

  const handleDeleted = () => {
    isDeletedRef.current = true;
    startTransition(() => router.refresh());
  };

  return (
    <ConfirmDeleteButton
      title="이 댓글을 지울까요?"
      description="두 사람 화면에서 모두 지워지고 되돌릴 수 없어요."
      subject="댓글을"
      noticeKey={`delete:comment:${commentId}`}
      onConfirm={handleConfirm}
      onDeleted={handleDeleted}
      failureMessage="댓글을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
      accessibleName="댓글 삭제"
      // 목록을 새로 받기 전에 끊기거나 0행이 지워져 댓글이 남아도 창이 "지우는 중"에 멈추지 않게 닫는다
      shouldCloseOnSuccess
      className="press-icon -my-3 -mr-3 h-11 px-3 text-[13px] text-ink-sub hover:text-ink"
    />
  );
};
