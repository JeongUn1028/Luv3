import { describe, expect, it } from "vitest";
import { config } from "./proxy";

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
