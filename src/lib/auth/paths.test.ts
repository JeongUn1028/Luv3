import { describe, expect, it } from "vitest";
import { getSafeNextPath, isPublicPath } from "./paths";

describe("isPublicPath", () => {
  it.each(["/login", "/auth/signout"])("%s는 비로그인으로 열 수 있다", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(["/", "/dates/1", "/loginx", "/authx", "/settings"])("%s는 로그인이 필요하다", (pathname) => {
    expect(isPublicPath(pathname)).toBe(false);
  });
});

describe("getSafeNextPath", () => {
  it("값이 없으면 홈으로 보낸다", () => {
    expect(getSafeNextPath(null)).toBe("/");
    expect(getSafeNextPath(undefined)).toBe("/");
    expect(getSafeNextPath("")).toBe("/");
  });

  it("같은 사이트 경로면 쿼리까지 그대로 돌려준다", () => {
    expect(getSafeNextPath("/dates/1?photo=2")).toBe("/dates/1?photo=2");
  });

  it.each([
    "https://evil.com",
    "//evil.com",
    "/\\evil.com",
    "/\t/evil.com",
    "/\n/evil.com",
    "javascript:alert(1)",
  ])("외부로 나가는 값 %j는 홈으로 바꾼다", (next) => {
    expect(getSafeNextPath(next)).toBe("/");
  });

  it("로그인·인증 경로로 돌아가면 반복되므로 홈으로 바꾼다", () => {
    expect(getSafeNextPath("/login")).toBe("/");
    expect(getSafeNextPath("/auth/signout")).toBe("/");
  });
});
