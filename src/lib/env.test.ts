import { describe, expect, it } from "vitest";
import { parseSupabaseEnv } from "./env";

describe("parseSupabaseEnv", () => {
  it("두 값이 있으면 그대로 돌려준다", () => {
    expect(parseSupabaseEnv({ url: "http://127.0.0.1:54321", publishableKey: "key" })).toEqual({
      url: "http://127.0.0.1:54321",
      publishableKey: "key",
    });
  });

  it("빠진 변수가 있으면 변수 이름을 알려 준다", () => {
    expect(() => parseSupabaseEnv({ url: undefined, publishableKey: undefined })).toThrow(
      "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    );
  });

  it("스킴이 없거나 URL 형식이 아니면 에러를 낸다", () => {
    expect(() => parseSupabaseEnv({ url: "127.0.0.1:54321", publishableKey: "key" })).toThrow("올바른 URL");
    expect(() => parseSupabaseEnv({ url: "not a url", publishableKey: "key" })).toThrow("올바른 URL");
  });
});
