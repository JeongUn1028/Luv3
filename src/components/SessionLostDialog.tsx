"use client";

import { useEffect, useId, useRef, useState, type ReactElement, type SubmitEvent } from "react";
import { TextField } from "@/components/FormField";
import { ModalActions, ModalMessage } from "@/components/ModalActions";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { SIGN_IN_UNAVAILABLE_MESSAGE } from "@/lib/auth/login-messages";
import { isSessionLostError, SESSION_LOST_EVENT } from "@/lib/auth/session-lost";
import { signInAgain } from "@/lib/auth/sign-in-again";
import { createClient } from "@/lib/supabase/client";

/** 로그인에 실패하면 화면에 보여 줄 문구를, 성공하면 undefined를 돌려준다 */
// async: 클라이언트를 만들다 던져도 거절된 약속이 되어 부르는 쪽의 catch가 받는다
const signInHere = async (email: string, password: string): Promise<string | undefined> => {
  const supabase = createClient();
  return signInAgain({ email, password, auth: supabase.auth, members: supabase.from("members") });
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
    const failure = await signInHere(email, password).catch(() => SIGN_IN_UNAVAILABLE_MESSAGE);
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
      <TextField id={emailId} label="이메일" type="email" autoComplete="username" required value={email} onChange={setEmail} isInDialog />
      <TextField
        id={passwordId}
        label="비밀번호"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={setPassword}
        isInDialog
        className="mt-4"
      />
      {message && <ModalMessage>{message}</ModalMessage>}
      <ModalActions cancelLabel="닫기" onCancel={onClose} confirmLabel={isPending ? "확인 중…" : "로그인"} isSubmit isDisabled={isPending} />
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
  const modalRef = useRef<ModalDialogHandle>(null);
  // 닫혀 있을 때 입력 칸을 그리지 않는다. 로그인 화면에서 비밀번호 자동 채우기가 숨은 칸을 고르지 않게 하고, 입력값도 남기지 않는다
  const [isOpen, setIsOpen] = useState(false);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    const handleSessionLost = async () => {
      // 거절 응답만으로 단정하지 않고 세션이 정말 사라졌는지 확인해, 다시 로그인해도 풀리지 않는 문제에는 창을 띄우지 않는다
      const { data, error } = await createClient().auth.getUser();
      const modal = modalRef.current;
      if (data.user || !isSessionLostError(error) || !modal || modal.isOpen()) return;
      setIsOpen(true);
      modal.open();
    };
    window.addEventListener(SESSION_LOST_EVENT, handleSessionLost);
    return () => window.removeEventListener(SESSION_LOST_EVENT, handleSessionLost);
  }, []);

  return (
    <ModalDialog
      ref={modalRef}
      title="다시 로그인해 주세요"
      description="로그인이 풀렸어요. 적어 둔 내용은 그대로 있으니, 로그인한 뒤 다시 저장해 주세요."
      isBusy={isPending}
      onClose={() => setIsOpen(false)}
    >
      {isOpen && <SessionLostForm isPending={isPending} onPendingChange={setIsPending} onClose={() => modalRef.current?.close()} />}
    </ModalDialog>
  );
};
