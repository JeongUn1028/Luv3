import { readFileSync } from "node:fs";
import { parse } from "smol-toml";
import { describe, expect, it } from "vitest";

interface AuthConfig {
  auth: {
    enable_signup: boolean;
    minimum_password_length: number;
    email: { enable_signup: boolean; template?: Record<string, unknown> };
  };
}

const config = parse(readFileSync(new URL("./config.toml", import.meta.url), "utf8")) as unknown as AuthConfig;

describe("supabase/config.toml 인증 설정", () => {
  it("새 회원가입은 막는다", () => {
    expect(config.auth.enable_signup).toBe(false);
  });

  // CLI에서 [auth.email].enable_signup은 이메일 로그인 자체를 켜고 끄는 값이라, 끄면 비밀번호 로그인도 막힌다
  it("이메일+비밀번호 로그인은 켜 둔다", () => {
    expect(config.auth.email.enable_signup).toBe(true);
  });

  it("비밀번호는 12자 이상이어야 한다", () => {
    expect(config.auth.minimum_password_length).toBeGreaterThanOrEqual(12);
  });

  it("매직 링크를 없앴으므로 메일 템플릿을 두지 않는다", () => {
    expect(config.auth.email.template).toBeUndefined();
  });
});
