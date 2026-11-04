import { describe, expect, it } from "vitest";
import {
  INVALID_CREDENTIALS_MESSAGE,
  SIGN_IN_UNAVAILABLE_MESSAGE,
  TOO_MANY_REQUESTS_MESSAGE,
  getLoginErrorMessage,
  getSignInErrorMessage,
} from "./login-messages";

describe("getLoginErrorMessage", () => {
  it("허용목록 밖 계정이면 안내 문장을 돌려준다", () => {
    expect(getLoginErrorMessage("not_member")).toBe("허용된 계정이 아닙니다.");
  });

  it("모르는 값이나 객체 기본 속성 이름이면 아무것도 보여 주지 않는다", () => {
    expect(getLoginErrorMessage(null)).toBeUndefined();
    expect(getLoginErrorMessage("unknown")).toBeUndefined();
    expect(getLoginErrorMessage("toString")).toBeUndefined();
  });

  it("없앤 매직 링크의 오류 값이면 아무것도 보여 주지 않는다", () => {
    expect(getLoginErrorMessage("link_invalid")).toBeUndefined();
  });
});

describe("getSignInErrorMessage", () => {
  it("이메일이나 비밀번호가 틀리면 어느 쪽인지 밝히지 않는 문장을 돌려준다", () => {
    expect(getSignInErrorMessage({ status: 400, code: "invalid_credentials" })).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it("이메일 미확인처럼 다른 요청 오류도 같은 문장으로 숨긴다", () => {
    expect(getSignInErrorMessage({ status: 400, code: "email_not_confirmed" })).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(getSignInErrorMessage({ status: 422 })).toBe(INVALID_CREDENTIALS_MESSAGE);
  });

  it("요청이 너무 잦으면 잠시 후 다시 시도하라고 안내한다", () => {
    expect(getSignInErrorMessage({ status: 429, code: "over_request_rate_limit" })).toBe(TOO_MANY_REQUESTS_MESSAGE);
    expect(getSignInErrorMessage({ status: 429 })).toBe(TOO_MANY_REQUESTS_MESSAGE);
  });

  it("서버 오류나 네트워크 오류면 비밀번호 탓으로 돌리지 않는다", () => {
    expect(getSignInErrorMessage({ status: 500 })).toBe(SIGN_IN_UNAVAILABLE_MESSAGE);
    expect(getSignInErrorMessage({ status: 0 })).toBe(SIGN_IN_UNAVAILABLE_MESSAGE);
    expect(getSignInErrorMessage({})).toBe(SIGN_IN_UNAVAILABLE_MESSAGE);
  });
});
