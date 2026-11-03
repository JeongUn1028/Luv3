import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// 홈 화면 앱을 처음 띄우면 iOS가 dvh·vh를 화면보다 작게 계산해 아래에 검정 여백이 생긴다(#51).
// Vitest(node)로는 레이아웃 높이를 잴 수 없어, 화면 높이를 정하는 방식 자체를 고정한다.

const SRC_DIR = fileURLToPath(new URL("..", import.meta.url));
const VIEWPORT_UNIT = /(?:\b\d+|-)[sdl]?vh\b|\bh-screen\b/;
// 앞에 다른 글자가 붙은 min-h-full·max-h-full은 제외한다
const FULL_HEIGHT = /(?<![\w-])h-full\b/;

const listSourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return listSourceFiles(path);
    return /\.(tsx?|css)$/.test(entry.name) && !entry.name.includes(".test.") ? [path] : [];
  });

// 주석에서 단위를 설명하는 것은 허용한다. 줄 번호가 유지되도록 블록 주석은 줄바꿈만 남긴다
const stripComments = (source: string): string =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ""))
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const getOpeningTag = (source: string, tag: string): string =>
  source.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0] ?? "";

describe("화면 높이", () => {
  it("화면 높이를 정할 때 dvh·vh 단위를 쓰지 않는다", () => {
    const offenders = listSourceFiles(SRC_DIR)
      .flatMap((path) =>
        stripComments(readFileSync(path, "utf8"))
          .split("\n")
          .map((line, index) => ({ line, at: `${relative(SRC_DIR, path)}:${index + 1}` })),
      )
      .filter(({ line }) => VIEWPORT_UNIT.test(line))
      .map(({ at }) => at);

    expect(offenders).toEqual([]);
  });

  it("html과 body를 h-full로 이어 화면 높이를 문서 높이에 맞춘다", () => {
    const layout = readFileSync(join(SRC_DIR, "app/layout.tsx"), "utf8");

    // body가 min-h-full이면 높이가 정해지지 않아 그 안의 min-h-full이 화면 높이를 받지 못한다
    expect(getOpeningTag(layout, "html")).toMatch(FULL_HEIGHT);
    expect(getOpeningTag(layout, "body")).toMatch(FULL_HEIGHT);
  });
});
