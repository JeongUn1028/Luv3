import { TOO_MANY_REQUESTS_MESSAGE } from "@/lib/auth/login-messages";
import { countChars } from "@/lib/form";

/** 새 비밀번호 최소 길이. `supabase/config.toml`의 `minimum_password_length`와 운영 설정에 맞춘다 */
export const PASSWORD_MIN_LENGTH = 12;

/** Supabase Auth가 받는 비밀번호 최대 길이(바이트). 넘으면 400으로 거절한다 */
const PASSWORD_MAX_BYTES = 72;

/**
 * 비밀번호 변경 폼의 칸.
 *
 * @example const fields: PasswordChangeFields = { currentPassword: "…", newPassword: "…", confirmPassword: "…" };
 */
export interface PasswordChangeFields {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * 칸별 에러 문구. 문제없는 칸은 키가 없다.
 *
 * @example const errors: PasswordChangeErrors = { newPassword: "12자 이상 적어 주세요." };
 */
export type PasswordChangeErrors = Partial<Record<keyof PasswordChangeFields, string>>;

const getNewPasswordError = ({ currentPassword, newPassword }: PasswordChangeFields): string | undefined => {
  if (countChars(newPassword) < PASSWORD_MIN_LENGTH) return `새 비밀번호는 ${PASSWORD_MIN_LENGTH}자 이상 적어 주세요.`;
  if (new TextEncoder().encode(newPassword).length > PASSWORD_MAX_BYTES) {
    return "비밀번호가 너무 길어요. 영문·숫자는 72자, 한글은 24자까지 쓸 수 있어요.";
  }
  if (newPassword === currentPassword) return "현재 비밀번호와 다른 비밀번호를 적어 주세요.";
  return undefined;
};

/**
 * 서버에 보내기 전에 입력값을 확인한다. 비밀번호는 앞뒤 공백까지 그대로 쓰므로 다듬지 않는다.
 *
 * @example validatePasswordChange({ currentPassword: "", newPassword: "short", confirmPassword: "short" }).newPassword // "새 비밀번호는 12자 이상 적어 주세요."
 */
export const validatePasswordChange = (fields: PasswordChangeFields): PasswordChangeErrors => {
  const newPasswordError = getNewPasswordError(fields);
  return {
    ...(fields.currentPassword === "" && { currentPassword: "현재 비밀번호를 적어 주세요." }),
    ...(newPasswordError && { newPassword: newPasswordError }),
    ...(fields.confirmPassword !== fields.newPassword && { confirmPassword: "새 비밀번호와 같게 적어 주세요." }),
  };
};

/** 실패에서 문구를 고르는 데 필요한 값만 받는다(AuthError와 호환). */
interface PasswordChangeFailure {
  status?: number;
  code?: string;
}

export const WRONG_CURRENT_PASSWORD_MESSAGE = "현재 비밀번호가 맞지 않아요.";
export const PASSWORD_CHANGE_UNAVAILABLE_MESSAGE = "비밀번호를 바꾸지 못했어요. 잠시 후 다시 시도해 주세요.";

const FAILURE_MESSAGES: Record<string, string> = {
  // 현재 비밀번호 확인(로그인)에서 틀린 경우와, 운영에서 서버 검사를 켠 뒤 변경 요청에서 틀린 경우다
  invalid_credentials: WRONG_CURRENT_PASSWORD_MESSAGE,
  current_password_invalid: WRONG_CURRENT_PASSWORD_MESSAGE,
  weak_password: `${PASSWORD_MIN_LENGTH}자 이상이면서 쉽게 짐작할 수 없는 비밀번호를 적어 주세요.`,
  same_password: "현재 비밀번호와 다른 비밀번호를 적어 주세요.",
  over_request_rate_limit: TOO_MANY_REQUESTS_MESSAGE,
};

/**
 * 비밀번호 변경 실패를 사용자에게 보여 줄 문장으로 바꾼다. 모르는 오류는 비밀번호 탓으로 돌리지 않고 다시 시도하라고 안내한다.
 *
 * @example getPasswordChangeErrorMessage({ status: 400, code: "invalid_credentials" }) // "현재 비밀번호가 맞지 않아요."
 */
export const getPasswordChangeErrorMessage = ({ status, code }: PasswordChangeFailure): string => {
  if (status === 429) return TOO_MANY_REQUESTS_MESSAGE;
  return (code && Object.hasOwn(FAILURE_MESSAGES, code) && FAILURE_MESSAGES[code]) || PASSWORD_CHANGE_UNAVAILABLE_MESSAGE;
};
