const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  not_member: "허용된 계정이 아닙니다.",
};

/**
 * 로그인 화면 URL의 `error` 값을 사용자에게 보여 줄 문장으로 바꾼다. 모르는 값이면 아무것도 보여 주지 않는다.
 *
 * @example getLoginErrorMessage("not_member") // "허용된 계정이 아닙니다."
 */
export const getLoginErrorMessage = (code: string | null): string | undefined =>
  code && Object.hasOwn(LOGIN_ERROR_MESSAGES, code) ? LOGIN_ERROR_MESSAGES[code] : undefined;

/** `signInWithPassword` 실패에서 문구를 고르는 데 필요한 값만 받는다(AuthError와 호환). */
interface SignInFailure {
  status?: number;
  code?: string;
}

export const INVALID_CREDENTIALS_MESSAGE = "이메일 또는 비밀번호가 맞지 않아요";
export const TOO_MANY_REQUESTS_MESSAGE = "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.";
export const SIGN_IN_UNAVAILABLE_MESSAGE = "로그인하지 못했어요. 잠시 후 다시 시도해 주세요.";

/**
 * 비밀번호 로그인 실패를 사용자에게 보여 줄 문장으로 바꾼다.
 * 계정이 없는 이메일과 틀린 비밀번호는 Supabase가 같은 `invalid_credentials`로 돌려주고,
 * 다른 4xx(이메일 미확인 등)도 같은 문장으로 보여 줘 어느 쪽이 틀렸는지 알 수 없게 한다.
 * 서버·네트워크 오류만 다시 시도하라고 안내한다.
 *
 * @example getSignInErrorMessage({ status: 400, code: "invalid_credentials" }) // "이메일 또는 비밀번호가 맞지 않아요"
 */
export const getSignInErrorMessage = ({ status, code }: SignInFailure): string => {
  if (status === 429 || code === "over_request_rate_limit") return TOO_MANY_REQUESTS_MESSAGE;
  if (status !== undefined && status >= 400 && status < 500) return INVALID_CREDENTIALS_MESSAGE;
  return SIGN_IN_UNAVAILABLE_MESSAGE;
};
