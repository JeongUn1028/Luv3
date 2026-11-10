import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "./headers";

const PRODUCTION = { supabaseUrl: "https://example.supabase.co", isDev: false };
const LOCAL = { supabaseUrl: "http://127.0.0.1:54321", isDev: false };

/** "script-src 'self' a b" → { "script-src": ["'self'", "a", "b"] } */
const parsePolicy = (policy: string): Record<string, string[]> =>
  Object.fromEntries(
    policy
      .split(";")
      .map((directive) => directive.trim().split(/\s+/))
      .filter(([name]) => name !== undefined && name !== "")
      .map(([name = "", ...sources]) => [name, sources]),
  );

describe("buildContentSecurityPolicy", () => {
  it("스크립트는 우리 앱과 카카오 지도 SDK(본체를 다시 불러오는 주소 포함)에서만 받는다", () => {
    const policy = parsePolicy(buildContentSecurityPolicy(PRODUCTION));

    expect(policy["script-src"]).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://dapi.kakao.com", "https://t1.kakaocdn.net"]);
  });

  it("Supabase로의 요청과 사진, 카카오 지도 그림을 허용한다", () => {
    const policy = parsePolicy(buildContentSecurityPolicy(PRODUCTION));

    expect(policy["connect-src"]).toEqual(["'self'", "https://example.supabase.co"]);
    expect(policy["img-src"]).toEqual(["'self'", "data:", "blob:", "https://example.supabase.co", "https://*.kakaocdn.net"]);
  });

  it("다른 사이트 안에 넣거나 플러그인·다른 주소로 폼을 보내는 것을 막는다", () => {
    const policy = parsePolicy(buildContentSecurityPolicy(PRODUCTION));

    expect(policy["frame-ancestors"]).toEqual(["'none'"]);
    expect(policy["object-src"]).toEqual(["'none'"]);
    expect(policy["base-uri"]).toEqual(["'self'"]);
    expect(policy["form-action"]).toEqual(["'self'"]);
  });

  it("Supabase 주소의 경로는 빼고 출처만 넣는다", () => {
    const policy = parsePolicy(buildContentSecurityPolicy({ ...PRODUCTION, supabaseUrl: "https://example.supabase.co/rest/v1" }));

    expect(policy["connect-src"]).toEqual(["'self'", "https://example.supabase.co"]);
  });

  // http인 로컬 Supabase 요청까지 https로 바꿔 E2E와 로컬 확인이 깨진다
  it("Supabase가 http면 요청을 https로 올리지 않는다", () => {
    expect(parsePolicy(buildContentSecurityPolicy(LOCAL))["upgrade-insecure-requests"]).toBeUndefined();
    expect(parsePolicy(buildContentSecurityPolicy(PRODUCTION))["upgrade-insecure-requests"]).toEqual([]);
  });

  // heic2any는 불러올 때 blob: 주소로 Worker를 만들고, Worker는 페이지의 CSP를 물려받은 채 new Function을 쓴다
  it("아이폰 사진(HEIC) 변환 Worker가 돌도록 blob: Worker와 eval을 허용한다", () => {
    const policy = parsePolicy(buildContentSecurityPolicy(PRODUCTION));

    expect(policy["worker-src"]).toEqual(["'self'", "blob:"]);
    expect(policy["script-src"]).toContain("'unsafe-eval'");
  });

  it("Supabase 주소가 올바르지 않으면 헤더를 만들지 않는다", () => {
    expect(() => buildContentSecurityPolicy({ ...PRODUCTION, supabaseUrl: "" })).toThrow();
  });
});

describe("buildSecurityHeaders", () => {
  it("CSP와 함께 기본 보안 헤더를 돌려준다", () => {
    const headers = Object.fromEntries(buildSecurityHeaders(PRODUCTION).map(({ key, value }) => [key, value]));

    expect(headers["Content-Security-Policy"]).toBe(buildContentSecurityPolicy(PRODUCTION));
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["Strict-Transport-Security"]).toBe("max-age=63072000");
  });

  // https로 띄운 개발 서버에서 받으면 같은 주소의 다른 http 프로젝트가 2년 동안 열리지 않는다
  it("개발 서버에서는 HSTS를 보내지 않는다", () => {
    const keys = buildSecurityHeaders({ ...LOCAL, isDev: true }).map(({ key }) => key);

    expect(keys).not.toContain("Strict-Transport-Security");
  });

  // 카카오 지도 키는 요청한 사이트 주소(Referer)로 허용 도메인을 확인하므로 다른 사이트에도 출처는 보내야 한다
  it("다른 사이트에는 경로 없이 출처만 보낸다", () => {
    const referrer = buildSecurityHeaders(PRODUCTION).find(({ key }) => key === "Referrer-Policy");

    expect(referrer?.value).toBe("strict-origin-when-cross-origin");
  });
});
