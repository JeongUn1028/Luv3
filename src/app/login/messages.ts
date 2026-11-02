const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  not_member: "허용된 계정이 아닙니다.",
  link_invalid: "로그인 링크가 만료됐거나 이미 사용됐습니다. 다시 요청해 주세요.",
};

/**
 * 로그인 화면 URL의 `error` 값을 사용자에게 보여 줄 문장으로 바꾼다. 모르는 값이면 아무것도 보여 주지 않는다.
 *
 * @example getLoginErrorMessage("not_member") // "허용된 계정이 아닙니다."
 */
export const getLoginErrorMessage = (code: string | null): string | undefined =>
  code && Object.hasOwn(LOGIN_ERROR_MESSAGES, code) ? LOGIN_ERROR_MESSAGES[code] : undefined;

/** 메일로 받은 6자리 숫자 코드인지 확인한다. 앞뒤 공백은 무시한다. */
export const isValidOtp = (token: string): boolean => /^\d{6}$/.test(token.trim());
