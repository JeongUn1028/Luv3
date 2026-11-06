"use client";

import { useState, type ReactElement, type SubmitEvent } from "react";
import { LOGIN_PATH, SIGN_OUT_PATH } from "@/lib/auth/paths";

/** 신호가 약해 요청이 끝나지 않을 때 실패로 알리기까지 기다리는 시간(ms) */
const SIGN_OUT_TIMEOUT = 10_000;

/**
 * 로그아웃 버튼. 폼을 그대로 보내면 인터넷이 끊겼을 때 브라우저 오류 화면으로 바뀌므로, 요청이 끝난 뒤에 옮긴다(#106).
 *
 * @example <LogoutForm />
 */
export const LogoutForm = (): ReactElement => {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string>();

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    setIsPending(true);
    setMessage(undefined);
    // 성공 응답은 로그인 화면으로 보내는 303이다. 따라가지 않고 응답만 확인한 뒤 쿠키가 지워진 상태로 문서를 새로 받는다
    const isSignedOut = await fetch(SIGN_OUT_PATH, { method: "POST", redirect: "manual", signal: AbortSignal.timeout(SIGN_OUT_TIMEOUT) }).then(
      (response) => response.type === "opaqueredirect",
      () => false,
    );
    // 옮기기 전에 되돌린다. 뒤로 가기로 이 화면이 그대로 복원되면 버튼이 눌리지 않은 채 남기 때문이다
    setIsPending(false);
    if (isSignedOut) {
      window.location.assign(LOGIN_PATH);
      return;
    }
    setMessage("로그아웃하지 못했어요. 잠시 후 다시 시도해 주세요.");
  };

  return (
    // action은 화면 코드가 아직 준비되지 않았을 때 그대로 폼을 보내기 위해 둔다
    <form action={SIGN_OUT_PATH} method="post" onSubmit={handleSubmit} className="mt-3">
      <button
        type="submit"
        disabled={isPending}
        className="press-wide h-[51px] w-full rounded-[10px] border border-line text-[15px] text-ink hover:bg-surface disabled:opacity-50"
      >
        {isPending ? "로그아웃하는 중…" : "로그아웃"}
      </button>
      {message && (
        <p role="alert" className="mt-3 text-[13px] text-accent">
          {message}
        </p>
      )}
    </form>
  );
};
