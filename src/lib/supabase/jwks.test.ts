import { createClient, type JWK } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { SUPABASE_JWKS, getSessionClaims } from "./jwks";

const SUPABASE_URL = "http://127.0.0.1:54321";
const JWKS_URL = `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`;
const USER_ID = "11111111-1111-4111-8111-111111111111";
const ES256 = { name: "ECDSA", namedCurve: "P-256" } as const;

interface SigningKey {
  privateKey: CryptoKey;
  publicJwk: JWK;
}

const toBase64Url = (bytes: Uint8Array): string => Buffer.from(bytes).toString("base64url");

const createSigningKey = async (kid: string): Promise<SigningKey> => {
  const { privateKey, publicKey } = await crypto.subtle.generateKey(ES256, true, ["sign", "verify"]);
  const exported = await crypto.subtle.exportKey("jwk", publicKey);
  return { privateKey, publicJwk: { ...exported, kid, alg: "ES256", use: "sig", key_ops: ["verify"], kty: "EC" } };
};

/** Supabase가 주는 접속 토큰처럼 ES256으로 서명한다. 서명 키의 kid를 머리에 단다 */
const signAccessToken = async (key: SigningKey, kid = key.publicJwk.kid): Promise<string> => {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(new TextEncoder().encode(JSON.stringify({ alg: "ES256", kid, typ: "JWT" })));
  const payload = toBase64Url(
    new TextEncoder().encode(JSON.stringify({ sub: USER_ID, role: "authenticated", aud: "authenticated", iat: now, exp: now + 3600 })),
  );
  const signature = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key.privateKey, new TextEncoder().encode(`${header}.${payload}`));
  return `${header}.${payload}.${toBase64Url(new Uint8Array(signature))}`;
};

/**
 * 로그인한 상태의 Supabase 클라이언트. 라이브러리는 받은 공개 키를 storageKey별로 프로세스 전체에 저장하므로
 * 테스트끼리 섞이지 않게 매번 다른 storageKey를 쓴다.
 */
const createSignedInAuth = (accessToken: string, fetcher: typeof fetch) => {
  const storageKey = `jwks-test-${crypto.randomUUID()}`;
  const session = {
    access_token: accessToken,
    refresh_token: "refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: USER_ID, aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() },
  };
  const values = new Map([[storageKey, JSON.stringify(session)]]);
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  };
  return createClient(SUPABASE_URL, "sb_publishable_test", {
    global: { fetch: fetcher },
    auth: { storage, storageKey, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
  }).auth;
};

const getRequestUrls = (fetcher: ReturnType<typeof vi.fn>): string[] =>
  fetcher.mock.calls.map(([input]) => (input instanceof Request ? input.url : String(input)));

describe("getSessionClaims", () => {
  it("넣어 둔 공개 키에 토큰의 kid가 있으면 Supabase에 공개 키를 묻지 않고 로그인 정보를 돌려준다", async () => {
    // Arrange
    const key = await createSigningKey("current-key");
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ keys: [] }));
    const auth = createSignedInAuth(await signAccessToken(key), fetcher);

    // Act
    const { data } = await getSessionClaims(auth, { keys: [key.publicJwk] });

    // Assert
    expect(data?.claims.sub).toBe(USER_ID);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("서명 키를 바꿔 넣어 둔 공개 키에 토큰의 kid가 없으면 Supabase에서 공개 키를 받아 로그인을 유지한다", async () => {
    // Arrange
    const oldKey = await createSigningKey("old-key");
    const newKey = await createSigningKey("new-key");
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ keys: [newKey.publicJwk] }));
    const auth = createSignedInAuth(await signAccessToken(newKey), fetcher);

    // Act
    const { data } = await getSessionClaims(auth, { keys: [oldKey.publicJwk] });

    // Assert
    expect(data?.claims.sub).toBe(USER_ID);
    expect(getRequestUrls(fetcher)).toEqual([JWKS_URL]);
  });

  it("넣어 둔 공개 키와 kid만 같고 다른 키로 서명한 토큰은 로그인 정보를 돌려주지 않는다", async () => {
    // Arrange
    const key = await createSigningKey("current-key");
    const forger = await createSigningKey("forger-key");
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ keys: [] }));
    const auth = createSignedInAuth(await signAccessToken(forger, "current-key"), fetcher);

    // Act
    const { data, error } = await getSessionClaims(auth, { keys: [key.publicJwk] });

    // Assert
    expect(data).toBeNull();
    expect(error?.message).toBe("Invalid JWT signature");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("공개 키를 넘기지 않으면 운영 공개 키(SUPABASE_JWKS)로 확인해 Supabase에 묻지 않는다", async () => {
    // Arrange: 운영 키의 비밀 키는 없으므로 운영 kid를 단 다른 키의 토큰으로, 넣어 둔 운영 키를 썼는지(서명 불일치)만 본다
    const productionKid = SUPABASE_JWKS.keys[0]?.kid;
    const forger = await createSigningKey("forger-key");
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ keys: [forger.publicJwk] }));
    const auth = createSignedInAuth(await signAccessToken(forger, productionKid), fetcher);

    // Act
    const { data, error } = await getSessionClaims(auth);

    // Assert
    expect(data).toBeNull();
    expect(error?.message).toBe("Invalid JWT signature");
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("SUPABASE_JWKS", () => {
  it("넣어 둔 운영 공개 키는 모두 ES256 서명 확인 키로 읽힌다", async () => {
    // Arrange
    const { keys } = SUPABASE_JWKS;

    // Act
    const imported = await Promise.all(keys.map((key) => crypto.subtle.importKey("jwk", key, ES256, true, ["verify"])));

    // Assert
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.every((key) => key.alg === "ES256" && typeof key.kid === "string")).toBe(true);
    expect(imported.every((cryptoKey) => cryptoKey.type === "public")).toBe(true);
  });
});
