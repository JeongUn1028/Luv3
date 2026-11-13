"use client";

import { useState, type ReactElement, type SubmitEvent } from "react";
import { LOGIN_PATH, SIGN_OUT_PATH } from "@/lib/auth/paths";
import { useResetOnHide } from "@/lib/navigation/use-reset-on-hide";
import { getThisDevicePushSubscription } from "@/lib/push/device-subscription";
import { SIGN_OUT_PUSH_ENDPOINT_FIELD } from "@/lib/push/message";

/** 신호가 약해 요청이 끝나지 않을 때 실패로 알리기까지 기다리는 시간(ms) */
const SIGN_OUT_TIMEOUT = 10_000;
/** 이 기기의 알림 구독을 읽거나 끊는 데 기다리는 시간(ms). 알림 정리 때문에 로그아웃이 늦어지지 않게 짧게 둔다 */
const PUSH_STEP_TIMEOUT = 3_000;

/** 정한 시간 안에 끝나지 않거나 실패하면 `undefined`로 넘어간다. 알림 정리가 로그아웃을 막지 않게 한다 */
const settleWithin = <Value,>(task: Promise<Value>, failureLabel: string): Promise<Value | undefined> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), PUSH_STEP_TIMEOUT);
  });
  const settled = task.catch((error: unknown) => {
    console.error(new Error(failureLabel, { cause: error }));
    return undefined;
  });
  return Promise.race([settled, timeout]).finally(() => clearTimeout(timer));
};

/**
 * 로그아웃 버튼. 폼을 그대로 보내면 인터넷이 끊겼을 때 브라우저 오류 화면으로 바뀌므로, 요청이 끝난 뒤에 옮긴다(#106).
 * 로그아웃한 뒤에도 이 기기로 상대 활동 알림이 오지 않게 이 기기의 구독 주소를 함께 보내, 로그아웃 경로가 그 행을 지운다(#364).
 * 로그아웃이 실패하면 아무것도 지우지 않아 알림이 그대로 온다.
 *
 * @example <LogoutForm />
 */
export const LogoutForm = (): ReactElement => {
  const [isPending, setIsPending] = useState(false);
  const [message, setMessage] = useState<string>();
  useResetOnHide(() => setMessage(undefined));

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    setIsPending(true);
    setMessage(undefined);
    const subscription = await settleWithin(getThisDevicePushSubscription(), "이 기기의 알림 구독을 읽지 못했습니다.");
    const body = new FormData();
    if (subscription) body.set(SIGN_OUT_PUSH_ENDPOINT_FIELD, subscription.endpoint);
    // 성공 응답은 로그인 화면으로 보내는 303이다. 따라가지 않고 응답만 확인한 뒤 쿠키가 지워진 상태로 문서를 새로 받는다
    const isSignedOut = await fetch(SIGN_OUT_PATH, { method: "POST", body, redirect: "manual", signal: AbortSignal.timeout(SIGN_OUT_TIMEOUT) }).then(
      (response) => response.type === "opaqueredirect",
      () => false,
    );
    // 서버가 행을 지웠다. 브라우저 구독도 끊어, 다음에 로그인한 사람의 설정 화면이 이 구독을 그 사람 것으로 다시 저장하지 않게 한다
    if (isSignedOut && subscription) await settleWithin(subscription.unsubscribe(), "로그아웃한 기기의 알림 구독을 끊지 못했습니다.");
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
