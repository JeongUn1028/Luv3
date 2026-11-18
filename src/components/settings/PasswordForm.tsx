"use client";

import { useRouter } from "next/navigation";
import { startTransition, useLayoutEffect, useRef, useState, type ReactElement, type SubmitEvent } from "react";
import { FormFooter } from "@/components/FormFooter";
import { TextField } from "@/components/FormField";
import { PageShell } from "@/components/PageShell";
import { SaveButton } from "@/components/SaveButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import {
  PASSWORD_CHANGE_UNAVAILABLE_MESSAGE,
  PASSWORD_MIN_LENGTH,
  WRONG_CURRENT_PASSWORD_MESSAGE,
  changePassword,
  validatePasswordChange,
  type PasswordChangeErrors,
} from "@/lib/auth/password-change";
import { SETTINGS_PASSWORD_PATH, SETTINGS_PATH } from "@/lib/auth/paths";
import { showInvalidFields } from "@/lib/focus-invalid-field";
import { clearError } from "@/lib/form";
import { saveNoticeStore } from "@/lib/navigation/save-notices";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { createClient } from "@/lib/supabase/client";

const NOTICE_FORM_KEY = "password";
const SAVED_TITLE = "비밀번호를 바꿨어요";

// async: 클라이언트를 만들다 던져도 거절된 약속이 되어 부르는 쪽의 catch가 받는다
const changeOwnPassword = async (passwords: { email: string; currentPassword: string; newPassword: string }): Promise<string | undefined> =>
  changePassword({ auth: createClient().auth, ...passwords });

interface PasswordFieldProps {
  id: string;
  label: string;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  value: string;
  error: string | undefined;
  isReadOnly: boolean;
  onChange: (value: string) => void;
}

const PasswordField = ({ id, label, autoComplete, placeholder, value, error, isReadOnly, onChange }: PasswordFieldProps): ReactElement => (
  <TextField
    id={id}
    label={label}
    name={id}
    type="password"
    autoComplete={autoComplete}
    placeholder={placeholder}
    value={value}
    // disabled는 비밀번호 관리자가 제출된 값을 읽지 못하게 할 수 있어 쓰지 않는다
    readOnly={isReadOnly}
    error={error}
    onChange={onChange}
  />
);

interface PasswordFormProps {
  /** 현재 비밀번호를 확인하고, 비밀번호 관리자가 어느 계정인지 알아보는 데 쓴다 */
  email: string;
}

/**
 * 비밀번호 바꾸기 폼. 바꾸면 이 기기의 로그인은 유지된다. 같은 계정의 다른 기기는 바로 끊기지 않고, 이미 받은 접속 토큰이 끝나면(최대 `jwt_expiry`, 1시간) 다시 로그인해야 한다.
 *
 * @example <PasswordForm email="me@example.com" />
 */
export const PasswordForm = ({ email }: PasswordFormProps): ReactElement => {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<PasswordChangeErrors>({});
  const [message, setMessage] = useState<string>();
  const [isPending, setIsPending] = useState(false);
  const isVisibleRef = useRef(false);

  useLayoutEffect(() => {
    isVisibleRef.current = true;
    saveNoticeStore.clearForm(NOTICE_FORM_KEY);
    return () => {
      isVisibleRef.current = false;
      // 다녀온 화면은 숨겨져 상태가 남으므로(Activity), 떠나는 즉시 비워 비밀번호가 메모리와 DOM에 남지 않게 한다
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
      setMessage(undefined);
    };
  }, []);

  /** 칸을 고치면 그 칸의 안내와 폼 전체 안내를 지운다. 안내가 남아 있으면 지금 적는 값이 틀린 것처럼 읽힌다 */
  const clearMessages = (field: keyof PasswordChangeErrors) => {
    setErrors((previous) => clearError(previous, field));
    setMessage(undefined);
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isPending) return;

    const nextErrors = validatePasswordChange({ currentPassword, newPassword, confirmPassword });
    if (showInvalidFields({ form: event.currentTarget, errors: nextErrors, setErrors, setNotice: setMessage })) return;

    setIsPending(true);
    setMessage(undefined);
    const failure = await changeOwnPassword({ email, currentPassword, newPassword }).catch(() => PASSWORD_CHANGE_UNAVAILABLE_MESSAGE);
    setIsPending(false);

    if (!failure) {
      saveNoticeStore.add({ formKey: NOTICE_FORM_KEY, isFailure: false, title: SAVED_TITLE });
      if (isVisibleRef.current) startTransition(() => router.replace(SETTINGS_PATH, { transitionTypes: BACK_TRANSITION }));
      return;
    }
    // 떠난 뒤에 실패하면 바뀐 줄 알고 새 비밀번호로 로그인하다 막히므로 놓치지 않게 알린다
    if (!isVisibleRef.current) {
      saveNoticeStore.add({ formKey: NOTICE_FORM_KEY, isFailure: true, title: "비밀번호를 바꾸지 못했어요", description: failure, href: SETTINGS_PASSWORD_PATH });
      return;
    }
    if (failure === WRONG_CURRENT_PASSWORD_MESSAGE) setCurrentPassword("");
    setMessage(failure);
  };

  return (
    <PageShell bottomSpace="sm" className="px-4" header={<ScreenHeader back={{ href: SETTINGS_PATH }} title="비밀번호 바꾸기" />}>
      <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-col gap-4">
        {/* 비밀번호 관리자가 어느 계정의 비밀번호를 바꾸는지 알아보게 한다. type="hidden"은 알아보지 못하는 경우가 있어 쓰지 않는다 */}
        <input type="text" name="username" autoComplete="username" value={email} readOnly className="hidden" />
        <PasswordField
          id="current-password"
          label="현재 비밀번호"
          autoComplete="current-password"
          value={currentPassword}
          error={errors.currentPassword}
          isReadOnly={isPending}
          onChange={(value) => {
            setCurrentPassword(value);
            clearMessages("currentPassword");
          }}
        />
        <PasswordField
          id="new-password"
          label="새 비밀번호"
          autoComplete="new-password"
          placeholder={`${PASSWORD_MIN_LENGTH}자 이상`}
          value={newPassword}
          error={errors.newPassword}
          isReadOnly={isPending}
          onChange={(value) => {
            setNewPassword(value);
            clearMessages("newPassword");
            // 확인 칸과의 비교도 달라지므로 다시 제출할 때 확인한다
            clearMessages("confirmPassword");
          }}
        />
        <PasswordField
          id="confirm-password"
          label="새 비밀번호 확인"
          autoComplete="new-password"
          value={confirmPassword}
          error={errors.confirmPassword}
          isReadOnly={isPending}
          onChange={(value) => {
            setConfirmPassword(value);
            clearMessages("confirmPassword");
          }}
        />
        <FormFooter notice={message}>
          <SaveButton isDisabled={isPending} offlineHint="연결되면 바꿀 수 있어요">
            {isPending ? "바꾸는 중…" : "비밀번호 바꾸기"}
          </SaveButton>
        </FormFooter>
      </form>
    </PageShell>
  );
};
