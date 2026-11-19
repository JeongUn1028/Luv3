"use client";

import { startTransition, useRef, useState, type ReactElement, type SubmitEvent } from "react";
import { FieldError } from "@/components/FormField";
import { OfflineHint } from "@/components/OfflineHint";
import { COMMENT_MAX_LENGTH, validateComment } from "@/lib/comments/comment";
import { createSendingComment, type CommentAction, type ShownComment } from "@/lib/comments/thread";
import { addComment } from "@/lib/comments/write";
import { countChars } from "@/lib/form";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { requestPartnerPush } from "@/lib/push/request-partner-push";
import { withLoadedClient } from "@/lib/supabase/load-client";
import { useOfflineBlock } from "@/lib/use-offline-block";

const SAVE_FAILED_MESSAGE = "댓글을 남기지 못했어요. 잠시 후 다시 시도해 주세요.";
// 쓰는 사이 상대가 기록을 지우면 남길 수 없다
const RECORD_GONE_MESSAGE = "이 기록은 지워져서 댓글을 남길 수 없어요.";

interface CommentFormProps {
  recordId: string;
  /** 지금 로그인한 사람. 먼저 붙이는 댓글의 이름표다 */
  memberNickname: string;
  /** 남긴 댓글을 저장하는 중. 실패하면 쓴 글을 칸에 돌려놓아야 하므로 그동안은 새로 쓰거나 남기지 못하게 한다 */
  isSending: boolean;
  /** 목록에 먼저 반영한다. transition 안에서만 부른다 */
  onOptimisticAction: (action: CommentAction) => void;
  /** 저장이 끝난 댓글. 목록에 남기고 댓글만 다시 읽는다. transition 안에서 부른다 */
  onSaved: (comment: ShownComment) => void;
}

/** 기록 상세 아래의 댓글 입력 칸. 남기면 저장을 기다리지 않고 목록 끝에 붙이고 칸을 비운다 */
export const CommentForm = ({ recordId, memberNickname, isSending, onOptimisticAction, onSaved }: CommentFormProps): ReactElement => {
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // 남긴 댓글은 목록 끝에 조용히 붙어 화면 읽기 프로그램이 알 수 없으므로 따로 알린다
  const [announcement, setAnnouncement] = useState("");
  // 실패한 댓글의 id와 내용. 저장은 됐는데 응답만 끊겼을 수 있어, 같은 내용을 다시 남기면 같은 id로 보내 두 번 생기지 않게 한다
  const failedRef = useRef<{ id: string; content: string }>(undefined);
  const { isBlocked: isOfflineBlocked, hintId: offlineHintId } = useOfflineBlock(isSending);
  // 쓴 글은 남기고, 다른 화면에 다녀온 뒤에도 방금 실패한 것처럼 보이는 지난 안내만 지운다(#261)
  useResetOnHide(() => {
    setNotice(undefined);
    setAnnouncement("");
  });

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSending) return;

    const nextError = validateComment(content);
    setError(nextError);
    if (nextError) return;

    const written = content;
    const trimmed = written.trim();
    const failed = failedRef.current;
    const id = failed?.content === trimmed ? failed.id : crypto.randomUUID();
    const comment = createSendingComment({ id, content: trimmed, authorNickname: memberNickname, now: new Date() });
    setContent("");
    setNotice(undefined);
    setAnnouncement("");
    startTransition(async () => {
      onOptimisticAction({ type: "add", comment });
      // 먼저 붙인 댓글과 같은 id로 저장해, 다시 받은 목록에서도 같은 줄로 이어진다
      const outcome = await withLoadedClient({
        request: (supabase) => addComment({ comment: { id: comment.id, recordId, content: comment.content }, comments: supabase.from("comments") }),
        onLoadFailed: () => "failed" as const,
      });
      if (outcome !== "saved") {
        // 먼저 붙인 댓글은 저절로 빠진다. 쓴 글은 칸에 돌려놓아 다시 남기게 한다.
        // 세션이 끊겼을 때 새로 받으면 로그인 화면으로 넘어가 다시 로그인 창이 소용없어지므로(#102) 새로 받지 않는다
        failedRef.current = { id: comment.id, content: comment.content };
        setContent(written);
        setNotice(outcome === "gone" ? RECORD_GONE_MESSAGE : SAVE_FAILED_MESSAGE);
        return;
      }
      failedRef.current = undefined;
      // 응답만 끊겨 같은 id로 다시 남긴 경우(중복 키)도 알린다. 이미 알렸으면 서버가 다시 보내지 않는다
      requestPartnerPush({ kind: "comment", id: comment.id });
      // await 뒤의 갱신은 다시 transition으로 감싸야 먼저 붙인 댓글이 목록에 남는 것과 한 번에 바뀐다.
      // 화면 전체를 다시 받지 않으므로 저장하는 동안 기록 고치기로 옮겼어도 쓰던 폼이 새로 만들어지지 않는다(#164)
      startTransition(() => {
        onOptimisticAction({ type: "saved", id: comment.id });
        setAnnouncement("댓글을 남겼어요.");
        onSaved(comment);
      });
    });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="mt-4 flex flex-col">
      <label htmlFor="comment-content" className="sr-only">
        댓글
      </label>
      <textarea
        id="comment-content"
        value={content}
        rows={2}
        placeholder="댓글을 남겨 보세요"
        // disabled는 초점을 빼앗아 키보드가 내려가므로, 저장하는 동안에는 고치지만 못하게 한다(칸은 이미 비어 있어 흐리게 하지 않는다)
        readOnly={isSending}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "comment-count comment-error" : "comment-count"}
        onChange={(event) => {
          setContent(event.target.value);
          setError(undefined);
        }}
        className="w-full resize-none rounded-[10px] border border-line bg-surface px-4 py-3 leading-[1.5] text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent"
      />
      <FieldError id="comment-error" error={error} />
      {notice && (
        <p role="alert" className="mt-2 text-[13px] text-accent">
          {notice}
        </p>
      )}
      <p role="status" className="sr-only">
        {announcement}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span id="comment-count" className="font-display text-[12px] tracking-[1px] text-ink-sub">
          {countChars(content.trim())}/{COMMENT_MAX_LENGTH}
        </span>
        <button
          type="submit"
          disabled={isSending}
          aria-disabled={isOfflineBlocked || undefined}
          aria-describedby={isOfflineBlocked ? offlineHintId : undefined}
          // 끊긴 채 보내면 "남기지 못했어요"라고 하며 쓴 글을 되돌리게 되므로 미리 막는다(SaveButton과 같다)
          onClick={(event) => {
            if (isOfflineBlocked) event.preventDefault();
          }}
          className="press-wide h-11 rounded-[10px] bg-accent px-5 font-display text-[14px] text-background disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50"
        >
          남기기
        </button>
      </div>
      <OfflineHint id={offlineHintId} isShown={isOfflineBlocked} className="mt-2" align="right">
        연결되면 남길 수 있어요
      </OfflineHint>
    </form>
  );
};
