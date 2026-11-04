"use client";

import { useEffect, useId, useRef, useState, type ReactElement, type SubmitEvent } from "react";
import { getSignInErrorMessage, NOT_MEMBER_MESSAGE, SIGN_IN_UNAVAILABLE_MESSAGE } from "@/lib/auth/login-messages";
import { isSessionLostError, SESSION_LOST_EVENT } from "@/lib/auth/session-lost";
import { createClient } from "@/lib/supabase/client";

const labelClassName = "text-[13px] text-ink-sub";
const inputClassName =
  "mt-2 h-[51px] w-full rounded-[10px] border border-line bg-background px-4 text-ink focus:border-accent focus:outline-none";

/** 로그인에 실패하면 화면에 보여 줄 문구를, 성공하면 undefined를 돌려준다 */
const signInAgain = async (email: string, password: string): Promise<string | undefined> => {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return getSignInErrorMessage(error);

  // 이 창은 화면을 옮기지 않아 서버의 허용목록 확인(getCurrentMember)을 거치지 않으므로 여기서 확인한다
  const { data: member, error: memberError } = await supabase.from("members").select("id").eq("id", data.user.id).maybeSingle();
  if (member) return undefined;
  await supabase.auth.signOut({ scope: "local" });
  return memberError ? SIGN_IN_UNAVAILABLE_MESSAGE : NOT_MEMBER_MESSAGE;
};

interface SessionLostFormProps {
  isPending: boolean;
  onPendingChange: (isPending: boolean) => void;
  onClose: () => void;
}

const SessionLostForm = ({ isPending, onPendingChange, onClose }: SessionLostFormProps): ReactElement => {
  const emailId = useId();
  const passwordId = useId();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string>();

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;
    onPendingChange(true);
    setMessage(undefined);
    const failure = await signInAgain(email, password).catch(() => SIGN_IN_UNAVAILABLE_MESSAGE);
    onPendingChange(false);
    // router.refresh()를 부르지 않는다. 고치기 화면은 다시 그릴 때마다 폼을 새로 만들어 적어 둔 내용이 사라진다
    if (!failure) {
      onClose();
      return;
    }
    setPassword("");
    setMessage(failure);
  };

  return (
    <form onSubmit={handleSubmit} className="mt-4 flex flex-col">
      <label htmlFor={emailId} className={labelClassName}>
        이메일
      </label>
      <input
        id={emailId}
        type="email"
        autoComplete="username"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        className={inputClassName}
      />
      <label htmlFor={passwordId} className={`${labelClassName} mt-4`}>
        비밀번호
      </label>
      <input
        id={passwordId}
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        className={inputClassName}
      />
      {message && (
        <p role="alert" className="mt-3 text-[13px] text-accent">
          {message}
        </p>
      )}
      <div className="mt-5 flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={onClose}
          className="h-12 flex-1 rounded-[10px] border border-line text-[15px] text-ink hover:bg-background disabled:opacity-50"
        >
          닫기
        </button>
        <button
          type="submit"
          disabled={isPending}
          className="h-12 flex-1 rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
        >
          {isPending ? "확인 중…" : "로그인"}
        </button>
      </div>
    </form>
  );
};

/**
 * 쓰는 중에 로그인이 풀리면 그 자리에서 다시 로그인하는 창.
 * 로그인 화면으로 옮기면 적어 둔 글과 고른 사진을 잃으므로 화면을 그대로 두고, 로그인한 뒤 저장을 다시 누르게 한다.
 *
 * @example <SessionLostDialog />
 */
export const SessionLostDialog = (): ReactElement => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  // 닫혀 있을 때 입력 칸을 그리지 않는다. 로그인 화면에서 비밀번호 자동 채우기가 숨은 칸을 고르지 않게 하고, 입력값도 남기지 않는다
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    const handleSessionLost = async () => {
      // 거절 응답만으로 단정하지 않고 세션이 정말 사라졌는지 확인해, 다시 로그인해도 풀리지 않는 문제에는 창을 띄우지 않는다
      const { data, error } = await createClient().auth.getUser();
      const dialog = dialogRef.current;
      if (data.user || !isSessionLostError(error) || !dialog || dialog.open) return;
      setIsOpen(true);
      dialog.showModal();
    };
    window.addEventListener(SESSION_LOST_EVENT, handleSessionLost);
    return () => window.removeEventListener(SESSION_LOST_EVENT, handleSessionLost);
  }, []);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      // 확인하는 중에 Esc로 닫혀 결과를 놓치지 않게 한다
      onCancel={(event) => {
        if (isPending) event.preventDefault();
      }}
      onClose={() => setIsOpen(false)}
      className="m-auto w-[calc(100%-32px)] max-w-[360px] rounded-[14px] border border-line bg-surface p-5 text-ink backdrop:bg-background/70"
    >
      <h2 id={titleId} className="text-[17px] font-bold">
        다시 로그인해 주세요
      </h2>
      <p id={descriptionId} className="mt-2 text-[14px] leading-[1.6] text-ink-sub">
        로그인이 풀렸어요. 적어 둔 내용은 그대로 있으니, 로그인한 뒤 다시 저장해 주세요.
      </p>
      {isOpen && <SessionLostForm isPending={isPending} onPendingChange={setIsPending} onClose={() => dialogRef.current?.close()} />}
    </dialog>
  );
};
