import { afterEach, describe, expect, it, vi } from "vitest";
import { getSessionClaims } from "@/lib/supabase/jwks";
import { loadClient } from "@/lib/supabase/load-client";
import { isSignedInHere, isSignedInNow } from "./signed-in";

// 토큰 확인 자체(넣어 둔 공개 키, 라이브러리 갱신)는 jwks.test.ts가 실제 서명으로 확인한다
vi.mock("@/lib/supabase/jwks", () => ({ getSessionClaims: vi.fn() }));
vi.mock("@/lib/supabase/load-client", () => ({ loadClient: vi.fn() }));

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

describe("isSignedInNow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.mocked(getSessionClaims).mockReset();
    vi.mocked(loadClient).mockReset();
  });

  it("불러온 클라이언트로 로그인을 본다", async () => {
    // Arrange
    setOnline(true);
    vi.mocked(loadClient).mockResolvedValue({ auth: AUTH } as Awaited<ReturnType<typeof loadClient>>);
    claimsWith({ data: { claims: { sub: "member" } }, error: null });

    // Act & Assert
    await expect(isSignedInNow()).resolves.toBe(true);
    expect(getSessionClaims).toHaveBeenCalledWith(AUTH);
  });

  it("끊겼으면 라이브러리를 받으러 가지 않고 거짓이다", async () => {
    // Arrange
    setOnline(false);

    // Act & Assert
    await expect(isSignedInNow()).resolves.toBe(false);
    expect(loadClient).not.toHaveBeenCalled();
  });

  // 끊김이나 배포로 라이브러리를 받지 못하면 새로 받기를 건너뛰어야 한다(받으면 로그인 화면으로 보내질 수 있다)
  it("라이브러리를 받지 못하면 기록하고 거짓이다", async () => {
    // Arrange
    setOnline(true);
    vi.mocked(loadClient).mockRejectedValue(new Error("파일을 받지 못함"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Act & Assert
    await expect(isSignedInNow()).resolves.toBe(false);
    expect(consoleError).toHaveBeenCalledOnce();
  });
});
