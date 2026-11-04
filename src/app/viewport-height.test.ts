import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

// 아이폰 홈 화면 앱(black-translucent + viewport-fit=cover)을 처음 띄우면 iOS가 innerHeight·100dvh·fixed 높이를
// 상태바만큼 작게(852 → 793) 알려 아래가 비었다. 실기기에서 100lvh만 늘 화면 높이와 같았다(#51).
// Vitest(node)로는 레이아웃 높이를 잴 수 없어, 화면 높이를 --app-height 한곳에서만 정하는지 고정한다.

// h-dvh·md:min-h-dvh·h-[100dvh]·calc(100vh-…)·h-svh·h-screen처럼 뷰포트 높이를 직접 쓰는 모든 형태
const VIEWPORT_UNIT = /(?:\b\d+|-)[sdl]?vh\b|\bh-screen\b/;

const readGlobalCss = (): string => readSource("app/globals.css");

describe("화면 높이", () => {
  it("뷰포트 높이 단위는 --app-height 정의에서만 쓰고, 화면은 h-app을 쓴다", () => {
    const offenders: string[] = [];
    let appHeightUsages = 0;

    for (const { at, lines } of readSourceLines()) {
      lines.forEach((line, index) => {
        if (/\bh-app\b/.test(line)) appHeightUsages += 1;
        if (VIEWPORT_UNIT.test(line) && !line.includes("--app-height:")) offenders.push(`${at}:${index + 1}`);
      });
    }

    expect(offenders).toEqual([]);
    // 검사할 화면이 없으면 이 테스트가 아무것도 지키지 못하므로 함께 확인한다
    expect(appHeightUsages).toBeGreaterThan(0);
  });

  it("--app-height는 기본 100dvh, 홈 화면 앱(display-mode: standalone)에서는 100lvh다", () => {
    const css = readGlobalCss();

    expect(css).toMatch(/:root\s*\{[^}]*--app-height:\s*100dvh;/);
    expect(css).toMatch(/@media\s*\(display-mode:\s*standalone\)\s*\{\s*:root\s*\{[^}]*--app-height:\s*100lvh;/);
  });

  it("h-app 유틸리티가 --app-height를 쓴다", () => {
    expect(readGlobalCss()).toMatch(/@utility\s+h-app\s*\{\s*height:\s*var\(--app-height\);/);
  });
});
