import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionClaims } from "@/lib/supabase/jwks";
import { isSignedInHere } from "./signed-in";

// 토큰 확인 자체(넣어 둔 공개 키, 라이브러리 갱신)는 jwks.test.ts가 실제 서명으로 확인한다
vi.mock("@/lib/supabase/jwks", () => ({ getSessionClaims: vi.fn() }));

type ClaimsResult = Awaited<ReturnType<typeof getSessionClaims>>;
type Auth = Parameters<typeof isSignedInHere>[0];

const AUTH = {} as Auth;
const claimsWith = (result: unknown) => vi.mocked(getSessionClaims).mockResolvedValue(result as ClaimsResult);
const setOnline = (isOnline: boolean) => vi.stubGlobal("navigator", { onLine: isOnline });

describe("isSignedInHere", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(getSessionClaims).mockReset();
  });

  it("인증 서버에 묻지 않고 서버와 같은 방식(getSessionClaims)으로 토큰을 확인해 로그인했으면 참을 돌려준다(#344)", async () => {
    // Arrange
    setOnline(true);
    claimsWith({ data: { claims: { sub: "member-1" } }, error: null });

    // Act
    const isSignedIn = await isSignedInHere(AUTH);

    // Assert
    expect(isSignedIn).toBe(true);
    expect(getSessionClaims).toHaveBeenCalledWith(AUTH);
  });

  it("세션이 없거나 토큰을 확인하지 못하면 거짓을 돌려준다", async () => {
    // Arrange
    setOnline(true);

    // Act & Assert
    claimsWith({ data: null, error: null });
    await expect(isSignedInHere(AUTH)).resolves.toBe(false);
    claimsWith({ data: null, error: new Error("만료된 세션을 갱신하지 못함") });
    await expect(isSignedInHere(AUTH)).resolves.toBe(false);
  });

  it("인터넷이 끊겼으면 토큰이 아직 유효해도 확인하지 않고 거짓을 돌려준다", async () => {
    // Arrange
    setOnline(false);
    claimsWith({ data: { claims: { sub: "member-1" } }, error: null });

    // Act
    const isSignedIn = await isSignedInHere(AUTH);

    // Assert
    expect(isSignedIn).toBe(false);
    expect(getSessionClaims).not.toHaveBeenCalled();
  });
});
