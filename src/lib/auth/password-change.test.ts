import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { describe, expect, it, vi } from "vitest";
import {
  changePassword,
  PASSWORD_CHANGE_UNAVAILABLE_MESSAGE,
  PASSWORD_MIN_LENGTH,
  WRONG_CURRENT_PASSWORD_MESSAGE,
  getPasswordChangeErrorMessage,
  validatePasswordChange,
  type PasswordChangeAuth,
} from "./password-change";

const VALID_FIELDS = {
  currentPassword: "current-password-1",
  newPassword: "new-password-12345",
  confirmPassword: "new-password-12345",
};

describe("validatePasswordChange", () => {
  it("세 칸이 모두 맞으면 에러가 없다", () => {
    expect(validatePasswordChange(VALID_FIELDS)).toEqual({});
  });

  it("현재 비밀번호를 비워 두면 적으라고 안내한다", () => {
    expect(validatePasswordChange({ ...VALID_FIELDS, currentPassword: "" }).currentPassword).toBeDefined();
  });

  it("새 비밀번호가 12자보다 짧으면 안내한다", () => {
    const shortPassword = "a".repeat(PASSWORD_MIN_LENGTH - 1);

    const errors = validatePasswordChange({ ...VALID_FIELDS, newPassword: shortPassword, confirmPassword: shortPassword });

    expect(errors.newPassword).toContain("12자");
  });

  it("새 비밀번호가 딱 12자면 받아들인다", () => {
    const password = "a".repeat(PASSWORD_MIN_LENGTH);

    expect(validatePasswordChange({ ...VALID_FIELDS, newPassword: password, confirmPassword: password })).toEqual({});
  });

  it("이모지는 한 글자로 센다", () => {
    const password = "😀".repeat(PASSWORD_MIN_LENGTH - 1);

    const errors = validatePasswordChange({ ...VALID_FIELDS, newPassword: password, confirmPassword: password });

    expect(errors.newPassword).toContain("12자");
  });

  it("앞뒤 공백을 지우지 않고 그대로 센다", () => {
    const password = `  ${"a".repeat(PASSWORD_MIN_LENGTH - 2)}`;

    expect(validatePasswordChange({ ...VALID_FIELDS, newPassword: password, confirmPassword: password })).toEqual({});
  });

  it("서버가 받지 않는 72바이트 넘는 비밀번호는 안내한다", () => {
    const password = "가".repeat(25);

    const errors = validatePasswordChange({ ...VALID_FIELDS, newPassword: password, confirmPassword: password });

    expect(errors.newPassword).toContain("너무 길어요");
  });

  it("새 비밀번호가 현재 비밀번호와 같으면 안내한다", () => {
    const { currentPassword } = VALID_FIELDS;

    const errors = validatePasswordChange({ currentPassword, newPassword: currentPassword, confirmPassword: currentPassword });

    expect(errors.newPassword).toContain("다른");
  });

  it("확인 칸이 새 비밀번호와 다르면 안내한다", () => {
    expect(validatePasswordChange({ ...VALID_FIELDS, confirmPassword: "different-password" }).confirmPassword).toBeDefined();
  });
});

describe("getPasswordChangeErrorMessage", () => {
  it("현재 비밀번호가 틀리면 그렇게 알린다", () => {
    expect(getPasswordChangeErrorMessage({ status: 400, code: "invalid_credentials" })).toBe(WRONG_CURRENT_PASSWORD_MESSAGE);
    expect(getPasswordChangeErrorMessage({ status: 400, code: "current_password_invalid" })).toBe(WRONG_CURRENT_PASSWORD_MESSAGE);
  });

  it("서버가 약한 비밀번호로 거절하면 다른 비밀번호를 적으라고 안내한다", () => {
    expect(getPasswordChangeErrorMessage({ status: 422, code: "weak_password" })).toContain("12자");
  });

  it("서버가 같은 비밀번호로 거절하면 다른 비밀번호를 적으라고 안내한다", () => {
    expect(getPasswordChangeErrorMessage({ status: 422, code: "same_password" })).toContain("다른");
  });

  it("요청이 너무 잦으면 잠시 후 다시 시도하라고 안내한다", () => {
    expect(getPasswordChangeErrorMessage({ status: 429, code: "over_request_rate_limit" })).toContain("잠시 후");
    expect(getPasswordChangeErrorMessage({ status: 429 })).toContain("잠시 후");
  });

  it("서버·네트워크 오류면 비밀번호 탓으로 돌리지 않는다", () => {
    expect(getPasswordChangeErrorMessage({ status: 500 })).toBe(PASSWORD_CHANGE_UNAVAILABLE_MESSAGE);
    expect(getPasswordChangeErrorMessage({ status: 0 })).toBe(PASSWORD_CHANGE_UNAVAILABLE_MESSAGE);
    expect(getPasswordChangeErrorMessage({})).toBe(PASSWORD_CHANGE_UNAVAILABLE_MESSAGE);
  });
});

describe("Supabase 설정", () => {
  it("최소 길이가 config.toml과 같다", () => {
    const config = parse(readFileSync("supabase/config.toml", "utf8")) as { auth: { minimum_password_length: number } };

    expect(config.auth.minimum_password_length).toBe(PASSWORD_MIN_LENGTH);
  });
});

interface FakeAuthParams {
  signInError?: { status?: number; code?: string } | null;
  updateError?: { status?: number; code?: string } | null;
}

/** 부른 값을 기록하고 정해 둔 결과를 돌려주는 가짜 auth */
const createFakeAuth = ({ signInError = null, updateError = null }: FakeAuthParams = {}) => {
  const auth = {
    signInWithPassword: vi.fn(async () => ({ error: signInError })),
    updateUser: vi.fn(async () => ({ error: updateError })),
  } satisfies PasswordChangeAuth;
  return auth;
};

const PASSWORDS = { email: "me@example.com", currentPassword: "current-password-1", newPassword: "new-password-1234" };

describe("changePassword", () => {
  it("현재 비밀번호로 로그인해 확인한 뒤 새 비밀번호로 바꾸고, 성공하면 문구가 없다", async () => {
    // Arrange
    const auth = createFakeAuth();

    // Act
    const message = await changePassword({ auth, ...PASSWORDS });

    // Assert
    expect(message).toBeUndefined();
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "me@example.com", password: "current-password-1" });
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "new-password-1234", current_password: "current-password-1" });
  });

  it("현재 비밀번호가 틀리면 바꾸지 않고 틀렸다고 알린다(서버 검사가 꺼져 있어도)", async () => {
    // Arrange
    const auth = createFakeAuth({ signInError: { status: 400, code: "invalid_credentials" } });

    // Act
    const message = await changePassword({ auth, ...PASSWORDS });

    // Assert
    expect(message).toBe(WRONG_CURRENT_PASSWORD_MESSAGE);
    expect(auth.updateUser).not.toHaveBeenCalled();
  });

  it("바꾸기가 거절되면 그 이유에 맞는 문구를 돌려준다", async () => {
    const auth = createFakeAuth({ updateError: { status: 422, code: "same_password" } });

    const message = await changePassword({ auth, ...PASSWORDS });

    expect(message).toBe("현재 비밀번호와 다른 비밀번호를 적어 주세요.");
  });
});
