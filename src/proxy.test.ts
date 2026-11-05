import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

// Next는 matcher 문자열을 경로 전체에 맞춰 검사한다. 정규식 부분만 쓰므로 같은 방식으로 흉내 낸다.
const matchesProxy = (pathname: string): boolean =>
  config.matcher.some((source) => new RegExp(`^${source}$`).test(pathname));

describe("proxy matcher", () => {
  it.each([
    "/",
    "/login",
    "/auth/signout",
    "/dates/1",
    // 공개 파일 이름으로 시작하거나 확장자 글자로 끝날 뿐인 주소는 공개 파일이 아니다
    "/manifest.webmanifest/x",
    "/manifestXwebmanifest",
    "/favicon.icon",
    "/robots.txt.bak",
    "/dates/xpng",
  ])("페이지 %s는 세션 확인을 거친다", (pathname) => {
    expect(matchesProxy(pathname)).toBe(true);
  });

  // 링크 미리보기 크롤러와 홈 화면 추가는 로그인 없이 이 파일들을 받아야 한다
  it.each([
    "/opengraph-image.png",
    "/apple-icon.png",
    "/manifest.webmanifest",
    "/icon-192.png",
    "/icon-512.png",
    "/icon.svg",
    "/favicon.ico",
    "/robots.txt",
    "/_next/static/chunks/app.js",
  ])("공개 파일 %s는 세션 확인 없이 보낸다", (pathname) => {
    expect(matchesProxy(pathname)).toBe(false);
  });
});

describe("proxy 연결 확인 요청", () => {
  it("HEAD 요청은 세션을 갱신하지 않고 바로 답한다", async () => {
    // Next는 끊긴 뒤 연결을 HEAD로 확인하고 200ms 뒤 끊어 버린다. 세션을 갱신하면 새 쿠키를 받지 못한 채 예전 토큰만 무효가 되어 로그아웃될 수 있다(#106)
    const request = new NextRequest("http://localhost/records", { method: "HEAD" });

    const response = await proxy(request);

    expect(response.status).toBe(204);
    expect(response.headers.get("x-middleware-next")).toBeNull();
    expect(response.cookies.getAll()).toEqual([]);
  });
});
