import { describe, expect, it } from "vitest";
import { getSafeNextPath, isPublicPath } from "./paths";

describe("isPublicPath", () => {
  it.each(["/login", "/auth/signout", "/api/keepalive", "/api/photo-cleanup"])("%s는 비로그인으로 열 수 있다", (pathname) => {
    expect(isPublicPath(pathname)).toBe(true);
  });

  it.each(["/", "/dates/1", "/loginx", "/authx", "/settings", "/api/keepalivex", "/api/keepalive/x", "/api/photo-cleanup/x", "/api"])("%s는 로그인이 필요하다", (pathname) => {
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
    "/.//evil.com",
    "/..//evil.com",
    "/a/..//evil.com",
    "/%2e//evil.com",
    "/.//",
    "/%2f/evil.com",
    "/%2F%2Fevil.com",
    "/%5c/evil.com",
    "//localhost/dates",
    "/.\\/evil.com",
  ])("외부로 나가는 값 %j는 홈으로 바꾼다", (next) => {
    expect(getSafeNextPath(next)).toBe("/");
  });

  it.each(["//", "///", "//[", "/%zz"])("주소로 읽을 수 없는 값 %j도 예외 없이 홈으로 바꾼다", (next) => {
    expect(getSafeNextPath(next)).toBe("/");
  });

  it("경로 중간의 겹친 슬래시는 외부로 나가지 않으므로 그대로 둔다", () => {
    expect(getSafeNextPath("/dates//1")).toBe("/dates//1");
  });

  it("한글 경로처럼 인코딩된 같은 사이트 경로는 그대로 돌려준다", () => {
    expect(getSafeNextPath("/dates/%ED%95%9C")).toBe("/dates/%ED%95%9C");
  });

  it.each(["/login", "/auth/signout", "/%6cogin", "/%61uth/signout", "/api/keepalive", "/api/keepalive/"])(
    "돌아갈 화면이 아닌 %s는 홈으로 바꾼다",
    (next) => {
      expect(getSafeNextPath(next)).toBe("/");
    },
  );
});
