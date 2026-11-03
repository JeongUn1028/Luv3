import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 아이폰 홈 화면 앱(black-translucent + viewport-fit=cover)을 처음 띄우면 iOS가 innerHeight·100dvh·fixed 높이를
// 상태바만큼 작게(852 → 793) 알려 아래가 비었다. 실기기에서 100lvh만 늘 화면 높이와 같았다(#51).
// Vitest(node)로는 레이아웃 높이를 잴 수 없어, 화면 높이를 --app-height 한곳에서만 정하는지 고정한다.

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
// h-dvh·md:min-h-dvh·h-[100dvh]·calc(100vh-…)·h-svh·h-screen처럼 뷰포트 높이를 직접 쓰는 모든 형태
const VIEWPORT_UNIT = /(?:\b\d+|-)[sdl]?vh\b|\bh-screen\b/;
// 진단 도구는 높이 단위를 재는 것이 목적이라 검사하지 않는다. TODO(#51): 진단 도구를 지울 때 함께 지운다
const EXCLUDED = [join("lib", "debug"), join("components", "ViewportDebug.tsx")];

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });

// 주석의 설명은 검사하지 않는다. 줄 번호가 유지되도록 블록 주석은 줄바꿈만 남긴다
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const readGlobalCss = (): string => stripComments(readFileSync(join(SRC_DIR, "app/globals.css"), "utf8"));

describe("화면 높이", () => {
  it("뷰포트 높이 단위는 --app-height 정의에서만 쓰고, 화면은 h-app·min-h-app을 쓴다", () => {
    const offenders: string[] = [];
    let appHeightUsages = 0;

    for (const path of listSourceFiles(SRC_DIR)) {
      const at = relative(SRC_DIR, path);
      if (EXCLUDED.some((excluded) => at.startsWith(excluded))) continue;
      const lines = stripComments(readFileSync(path, "utf8")).split("\n");
      lines.forEach((line, index) => {
        if (/\b(min-)?h-app\b/.test(line)) appHeightUsages += 1;
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

  it("h-app·min-h-app 유틸리티가 --app-height를 쓴다", () => {
    const css = readGlobalCss();

    expect(css).toMatch(/@utility\s+h-app\s*\{\s*height:\s*var\(--app-height\);/);
    expect(css).toMatch(/@utility\s+min-h-app\s*\{\s*min-height:\s*var\(--app-height\);/);
  });
});
