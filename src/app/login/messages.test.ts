import { describe, expect, it } from "vitest";
import { getLoginErrorMessage, isValidOtp } from "./messages";

describe("getLoginErrorMessage", () => {
  it("허용목록 밖 계정이면 안내 문장을 돌려준다", () => {
    expect(getLoginErrorMessage("not_member")).toBe("허용된 계정이 아닙니다.");
  });

  it("모르는 값이나 객체 기본 속성 이름이면 아무것도 보여 주지 않는다", () => {
    expect(getLoginErrorMessage(null)).toBeUndefined();
    expect(getLoginErrorMessage("unknown")).toBeUndefined();
    expect(getLoginErrorMessage("toString")).toBeUndefined();
  });
});

describe("isValidOtp", () => {
  it("앞뒤 공백을 빼고 6자리 숫자면 통과한다", () => {
    expect(isValidOtp("123456")).toBe(true);
    expect(isValidOtp(" 123456 ")).toBe(true);
  });

  it("자릿수가 다르거나 숫자가 아니면 통과하지 않는다", () => {
    expect(isValidOtp("12345")).toBe(false);
    expect(isValidOtp("1234567")).toBe(false);
    expect(isValidOtp("12a456")).toBe(false);
  });
});
