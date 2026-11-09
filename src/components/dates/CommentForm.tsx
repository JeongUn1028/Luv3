"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactElement, type SubmitEvent } from "react";
import { COMMENT_MAX_LENGTH, validateComment } from "@/lib/comments/comment";
import { countChars } from "@/lib/form";
import { createClient } from "@/lib/supabase/client";

const SAVE_FAILED_MESSAGE = "댓글을 남기지 못했어요. 잠시 후 다시 시도해 주세요.";
const RECORD_GONE_MESSAGE = "이 기록은 지워져서 댓글을 남길 수 없어요.";
// 쓰는 사이 상대가 기록을 지우면 없는 기록을 가리켜 외래 키 위반이 난다
const FOREIGN_KEY_VIOLATION = "23503";

interface CommentFormProps {
  recordId: string;
}

/** 기록 상세 아래의 댓글 입력 칸. 남기면 칸을 비우고 기록 화면을 새로 받아 목록 끝에 붙인다 */
export const CommentForm = ({ recordId }: CommentFormProps): ReactElement => {
  const router = useRouter();
  const [content, setContent] = useState("");
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();
  // 남긴 댓글은 목록 끝에 조용히 붙어 화면 읽기 프로그램이 알 수 없으므로 따로 알린다
  const [announcement, setAnnouncement] = useState("");
  const [isPending, startSaving] = useTransition();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const nextError = validateComment(content);
    setError(nextError);
    if (nextError) return;

    setNotice(undefined);
    setAnnouncement("");
    startSaving(async () => {
      const { error: insertError } = await createClient()
        .from("comments")
        .insert({ date_id: recordId, content: content.trim() });
      if (insertError) {
        // 세션이 끊겼을 때 새로 받으면 로그인 화면으로 넘어가 다시 로그인 창이 소용없어지므로(#102) 쓴 글을 둔 채 문구만 보여 준다
        setNotice(insertError.code === FOREIGN_KEY_VIOLATION ? RECORD_GONE_MESSAGE : SAVE_FAILED_MESSAGE);
        return;
      }
      // await 뒤의 갱신은 다시 transition으로 감싸야 새 목록이 올 때까지 쓴 글과 "남기는 중"이 그대로 남는다
      startSaving(() => {
        setContent("");
        setAnnouncement("댓글을 남겼어요.");
        router.refresh();
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
        // disabled는 초점을 빼앗아 키보드가 내려가므로, 남기는 동안에는 고치지만 못하게 한다
        readOnly={isPending}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? "comment-count comment-error" : "comment-count"}
        onChange={(event) => {
          setContent(event.target.value);
          setError(undefined);
        }}
        className="w-full resize-none rounded-[10px] border border-line bg-surface px-4 py-3 leading-[1.5] text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none read-only:opacity-50 aria-[invalid=true]:border-accent"
      />
      {error && (
        <p id="comment-error" className="mt-2 text-[12px] text-accent">
          {error}
        </p>
      )}
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
          disabled={isPending}
          className="press-wide h-11 rounded-[10px] bg-accent px-5 font-display text-[14px] text-background disabled:opacity-50"
        >
          {isPending ? "남기는 중…" : "남기기"}
        </button>
      </div>
    </form>
  );
};
