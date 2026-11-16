import { NextRequest, NextResponse } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { redirectWithSession, updateSession } from "./proxy";

describe("redirectWithSession", () => {
  it("갱신된 세션 쿠키를 옵션까지 그대로 리다이렉트 응답에 옮긴다", () => {
    // Arrange
    const sessionResponse = NextResponse.next();
    sessionResponse.cookies.set("sb-auth-token", "새 토큰", { httpOnly: true, path: "/", maxAge: 400 });

    // Act
    const response = redirectWithSession(new URL("http://localhost/login"), sessionResponse);

    // Assert
    expect(response.headers.get("location")).toBe("http://localhost/login");
    expect(response.cookies.get("sb-auth-token")).toMatchObject({ value: "새 토큰", httpOnly: true, path: "/", maxAge: 400 });
  });

  it("세션을 갱신하며 붙은 캐시 금지 헤더도 옮긴다(갱신한 쿠키를 앞단이 캐시해 남에게 주지 않게)", () => {
    // Arrange
    const sessionResponse = NextResponse.next();
    sessionResponse.headers.set("cache-control", "private, no-cache, no-store, must-revalidate, max-age=0");
    sessionResponse.headers.set("expires", "0");
    sessionResponse.headers.set("pragma", "no-cache");

    // Act
    const response = redirectWithSession(new URL("http://localhost/"), sessionResponse);

    // Assert
    expect(response.headers.get("cache-control")).toBe("private, no-cache, no-store, must-revalidate, max-age=0");
    expect(response.headers.get("expires")).toBe("0");
    expect(response.headers.get("pragma")).toBe("no-cache");
  });

  it("세션이 갱신되지 않았으면 쿠키도 캐시 헤더도 붙이지 않는다", () => {
    const response = redirectWithSession(new URL("http://localhost/"), NextResponse.next());

    expect(response.cookies.getAll()).toEqual([]);
    expect(response.headers.get("pragma")).toBeNull();
  });
});

describe("updateSession", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("로그인하지 않고 화면을 열면 로그인 화면으로 보내고, 로그인 뒤 돌아올 주소를 붙인다", async () => {
    const response = await updateSession(new NextRequest("http://localhost/records?tag=1"));

    expect(response.headers.get("location")).toBe("http://localhost/login?next=%2Frecords%3Ftag%3D1");
  });

  it("로그인하지 않고 홈을 열면 돌아올 주소 없이 로그인 화면으로 보낸다", async () => {
    const response = await updateSession(new NextRequest("http://localhost/"));

    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("로그인하지 않아도 로그인 화면은 그대로 연다", async () => {
    const response = await updateSession(new NextRequest("http://localhost/login"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });
});
