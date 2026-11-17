import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SIGN_OUT_PUSH_ENDPOINT_FIELD } from "@/lib/push/message";
import { getSessionClaims } from "@/lib/supabase/jwks";
import { createClient } from "@/lib/supabase/server";
import { GET, POST } from "./route";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/jwks", () => ({ getSessionClaims: vi.fn() }));

const PHONE = "https://push.example/phone";

interface FakeSupabaseOptions {
  deleteError?: { message: string };
  /** 허용목록 확인(`is_member`)의 답 */
  isMember?: { data: boolean | null; error: { message: string } | null };
}

/** 로그아웃 경로가 부르는 구독 지우기(delete…eq)와 로그아웃만 흉내 내고, 부른 순서를 기록한다 */
const fakeSupabase = ({ deleteError, isMember = { data: true, error: null } }: FakeSupabaseOptions = {}) => {
  const calls: string[] = [];
  const client = {
    from: (table: string) => ({
      delete: () => ({
        eq: (column: string, value: string) => {
          calls.push(`delete ${table} ${column}=${value}`);
          return Promise.resolve({ error: deleteError ?? null });
        },
      }),
    }),
    rpc: (name: string) => {
      calls.push(`rpc ${name}`);
      return Promise.resolve(isMember);
    },
    auth: {
      signOut: (options: unknown) => {
        calls.push(`signOut ${JSON.stringify(options)}`);
        return Promise.resolve({ error: null });
      },
    },
  };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
};

const signOutRequest = (fields: Record<string, string> = {}): NextRequest => {
  const body = new FormData();
  Object.entries(fields).forEach(([name, value]) => body.set(name, value));
  return new NextRequest("http://localhost/auth/signout", { method: "POST", body });
};

describe("POST /auth/signout", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  // 로그아웃한 뒤에도 이 기기로 상대 활동 알림이 오지 않게, 세션이 있을 때 이 기기의 구독 행을 지운다(#364)
  it("이 기기의 구독 주소를 보내면 그 행을 지운 뒤 로그아웃하고 로그인 화면으로 보낸다", async () => {
    // Arrange
    const calls = fakeSupabase();

    // Act
    const response = await POST(signOutRequest({ [SIGN_OUT_PUSH_ENDPOINT_FIELD]: PHONE }));

    // Assert
    expect(calls).toEqual([`delete push_subscriptions endpoint=${PHONE}`, 'signOut {"scope":"local"}']);
    expect(response.status).toBe(303);
    expect(new URL(response.headers.get("location") ?? "").pathname).toBe("/login");
  });

  it.each([
    ["구독 주소가 없으면(알림을 켜지 않은 기기, 화면 코드 전에 보낸 폼)", {}],
    ["https 주소가 아니면", { [SIGN_OUT_PUSH_ENDPOINT_FIELD]: "javascript:alert(1)" }],
  ])("%s 구독은 건드리지 않고 로그아웃한다", async (_, fields) => {
    // Arrange
    const calls = fakeSupabase();

    // Act
    const response = await POST(signOutRequest(fields));

    // Assert
    expect(calls).toEqual(['signOut {"scope":"local"}']);
    expect(response.status).toBe(303);
  });

  it("본문이 폼이 아니어도 로그아웃한다", async () => {
    // Arrange
    const calls = fakeSupabase();

    // Act
    const response = await POST(new NextRequest("http://localhost/auth/signout", { method: "POST" }));

    // Assert
    expect(calls).toEqual(['signOut {"scope":"local"}']);
    expect(response.status).toBe(303);
  });

  it("구독 행을 지우지 못해도 로그아웃하고 원인을 로그에 남긴다", async () => {
    // Arrange
    const calls = fakeSupabase({ deleteError: { message: "timeout" } });

    // Act
    const response = await POST(signOutRequest({ [SIGN_OUT_PUSH_ENDPOINT_FIELD]: PHONE }));

    // Assert
    expect(calls.at(-1)).toBe('signOut {"scope":"local"}');
    expect(response.status).toBe(303);
    expect(console.error).toHaveBeenCalledWith("로그아웃: 이 기기의 알림 구독을 지우지 못했습니다", "timeout");
  });
});

/** 세션 토큰을 확인한 결과를 정한다. `userId`가 없으면 로그인하지 않은 것이다 */
const setSession = (userId: string | undefined): void => {
  const data = userId ? { claims: { sub: userId } } : null;
  vi.mocked(getSessionClaims).mockResolvedValue({ data, error: null } as unknown as Awaited<ReturnType<typeof getSessionClaims>>);
};

const notMemberRequest = (): NextRequest => new NextRequest("http://localhost/auth/signout?reason=not_member");

const locationOf = (response: Response): URL => new URL(response.headers.get("location") ?? "");

// 허용목록 밖 계정을 내보내는 경로(getCurrentMember가 보낸다). 다른 사이트의 링크로 열려도 허용된 사람은 로그아웃되지 않아야 한다
describe("GET /auth/signout", () => {
  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it("허용목록 밖 계정이면 로그아웃하고 로그인 화면에 not_member를 붙여 보낸다", async () => {
    // Arrange
    setSession("outsider");
    const calls = fakeSupabase({ isMember: { data: false, error: null } });

    // Act
    const response = await GET(notMemberRequest());

    // Assert
    expect(calls).toEqual(["rpc is_member", 'signOut {"scope":"local"}']);
    expect(response.status).toBe(307);
    expect(locationOf(response).pathname).toBe("/login");
    expect(locationOf(response).searchParams.get("error")).toBe("not_member");
  });

  it("허용된 사람이면 로그아웃하지 않고 홈으로 돌려보낸다", async () => {
    // Arrange
    setSession("member");
    const calls = fakeSupabase({ isMember: { data: true, error: null } });

    // Act
    const response = await GET(notMemberRequest());

    // Assert
    expect(calls).toEqual(["rpc is_member"]);
    expect(response.status).toBe(307);
    expect(locationOf(response).pathname).toBe("/");
  });

  // 일시적인 DB 오류로 허용된 사람을 로그아웃시키지 않는다
  it("허용목록을 확인하지 못하면 로그아웃하지 않고 에러를 낸다", async () => {
    // Arrange
    setSession("member");
    const calls = fakeSupabase({ isMember: { data: null, error: { message: "timeout" } } });

    // Act
    const signingOut = GET(notMemberRequest());

    // Assert
    await expect(signingOut).rejects.toThrow("허용목록을 확인하지 못했습니다: timeout");
    expect(calls).toEqual(["rpc is_member"]);
  });

  it("로그인하지 않았으면 묻지 않고 로그인 화면으로 보낸다", async () => {
    // Arrange
    setSession(undefined);
    const calls = fakeSupabase();

    // Act
    const response = await GET(notMemberRequest());

    // Assert
    expect(calls).toEqual([]);
    expect(response.status).toBe(307);
    expect(locationOf(response).pathname).toBe("/login");
    expect(locationOf(response).searchParams.get("error")).toBeNull();
  });
});
