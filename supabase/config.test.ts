import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";

interface AuthConfig {
  auth: { site_url: string; enable_signup: boolean; email: { enable_signup: boolean } };
}

const config = parse(readFileSync(new URL("./config.toml", import.meta.url), "utf8")) as unknown as AuthConfig;

describe("supabase/config.toml 인증 설정", () => {
  it("새 회원가입은 막는다", () => {
    expect(config.auth.enable_signup).toBe(false);
  });

  // CLI에서 [auth.email].enable_signup은 이메일 로그인 자체를 켜고 끄는 값이라, 끄면 매직 링크도 막힌다
  it("이메일 로그인(매직 링크)은 켜 둔다", () => {
    expect(config.auth.email.enable_signup).toBe(true);
  });

  // 메일 링크 호스트가 dev 서버 주소(localhost)와 다르면 쿠키가 다른 호스트에 심겨 로그인이 풀린다
  it("메일 링크의 기준 주소는 dev 서버 주소와 같다", () => {
    expect(config.auth.site_url).toBe("http://localhost:3000");
  });
});
