import { describe, expect, it, vi } from "vitest";
import { INVALID_CREDENTIALS_MESSAGE, NOT_MEMBER_MESSAGE, SIGN_IN_UNAVAILABLE_MESSAGE } from "./login-messages";
import { signInAgain, type MemberLookupTable, type SignInAuth } from "./sign-in-again";

const USER_ID = "10000000-0000-4000-8000-000000000001";

interface FakeParams {
  signInError?: { status?: number; code?: string };
  member?: { id: string } | null;
  memberError?: { message: string } | null;
}

/** 부른 값을 기록하고 정해 둔 결과를 돌려주는 가짜 인증과 회원 표 */
const createFakes = ({ signInError, member = { id: USER_ID }, memberError = null }: FakeParams = {}) => {
  const lookedUp: string[] = [];
  const auth = {
    signInWithPassword: vi.fn<SignInAuth["signInWithPassword"]>(async () =>
      signInError ? { data: { user: null }, error: signInError } : { data: { user: { id: USER_ID } }, error: null },
    ),
    signOut: vi.fn<SignInAuth["signOut"]>(async () => ({ error: null })),
  };
  const members: MemberLookupTable = {
    select: () => ({
      eq: (_column, id) => ({
        maybeSingle: async () => {
          lookedUp.push(id);
          return { data: member, error: memberError };
        },
      }),
    }),
  };
  return { auth, members, lookedUp };
};

describe("signInAgain", () => {
  it("앞뒤 공백을 뺀 이메일로 로그인하고, 허용된 회원이면 문구 없이 끝낸다", async () => {
    // Arrange
    const { auth, members, lookedUp } = createFakes();

    // Act
    const message = await signInAgain({ email: "  a@example.com ", password: "비밀번호", auth, members });

    // Assert
    expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "a@example.com", password: "비밀번호" });
    expect(lookedUp).toEqual([USER_ID]);
    expect(auth.signOut).not.toHaveBeenCalled();
    expect(message).toBeUndefined();
  });

  it("로그인에 실패하면 회원을 찾지 않고 실패 문구를 돌려준다", async () => {
    const { auth, members, lookedUp } = createFakes({ signInError: { status: 400, code: "invalid_credentials" } });

    expect(await signInAgain({ email: "a@example.com", password: "틀림", auth, members })).toBe(INVALID_CREDENTIALS_MESSAGE);
    expect(lookedUp).toEqual([]);
  });

  it("허용목록 밖 계정이면 이 기기에서만 로그아웃하고 허용되지 않았다고 알린다", async () => {
    const { auth, members } = createFakes({ member: null });

    expect(await signInAgain({ email: "a@example.com", password: "비밀번호", auth, members })).toBe(NOT_MEMBER_MESSAGE);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("회원을 확인하지 못하면 로그아웃하고 다시 시도하라고 알린다", async () => {
    const { auth, members } = createFakes({ member: null, memberError: { message: "timeout" } });

    expect(await signInAgain({ email: "a@example.com", password: "비밀번호", auth, members })).toBe(SIGN_IN_UNAVAILABLE_MESSAGE);
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
