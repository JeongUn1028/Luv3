import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

// 홈 화면 앱을 처음 띄우면 iOS가 뷰포트를 상태바만큼 작게(852 → 793) 알리고, 그동안 fixed 요소도 793 기준으로 그린다(#51).
// 문서 스크롤 대신 화면 틀(PageShell) 안쪽에서만 스크롤하게 하고, 틀·safe-area 규칙을 한곳에 모은다(#63, #58).
// Vitest(node)로는 레이아웃을 잴 수 없어 소스 규칙으로 고정한다.

const SHELL = "components/PageShell.tsx";

const findLines = (pattern: RegExp, allowed: readonly string[]): string[] =>
  readSourceLines().flatMap(({ at, lines }) =>
    allowed.includes(at)
      ? []
      : lines.flatMap((line, index) => (pattern.test(line) ? [`${at}:${index + 1}`] : [])),
  );

describe("화면 틀", () => {
  it("화면의 main은 PageShell에서만 만든다", () => {
    expect(findLines(/<main\b/, [SHELL])).toEqual([]);
  });

  it("PageShell은 머리글까지 담은 main을 화면 높이(h-app)로 고정하고 안쪽 영역만 스크롤한다", () => {
    const shell = readSource(SHELL);

    // 화면 제목(h1)이 본문 영역 안에 남도록 머리글도 main 안에 둔다
    expect(shell).toMatch(/<main\s+className="[^"]*\bh-app\b[^"]*\bflex-col\b[^"]*">\s*\{header &&/);
    // min-h-0이 없으면 flex 자식이 내용만큼 늘어나 안쪽 스크롤이 생기지 않는다
    expect(shell).toMatch(/"[^"]*\bmin-h-0\b[^"]*\bflex-1\b[^"]*",\s*isScrollable \? "[^"]*\boverflow-y-auto\b[^"]*\boverscroll-contain\b/);
  });

  it("세로 스크롤 영역은 absolute 자식(sr-only 등)의 기준 상자가 된다", () => {
    // 기준 상자가 없으면 sr-only 문구가 스크롤 안쪽 위치 그대로 문서 기준으로 놓여 문서 전체가 스크롤된다(기록 고치기 265px)
    const scrollAreas = readSourceLines().flatMap(({ at, lines }) =>
      lines.flatMap((line, index) => (/\boverflow-y-auto\b/.test(line) ? [{ at: `${at}:${index + 1}`, line }] : [])),
    );

    expect(scrollAreas.length).toBeGreaterThan(0);
    expect(scrollAreas.filter(({ line }) => !/\brelative\b/.test(line)).map(({ at }) => at)).toEqual([]);
  });

  it("html·body는 튕김을 막되 overflow: hidden은 걸지 않는다", () => {
    const css = readSource("app/globals.css");
    const rootRules = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, selector]) =>
      /(?:^|[\s,])(?:html|body)(?=[\s,:]|$)/.test(selector.trim()),
    );
    const rootTags = readSource("app/layout.tsx").match(/<(?:html|body)\b[^>]*>/g) ?? [];

    expect(css).toMatch(/html,\s*body\s*\{[^}]*overscroll-behavior:\s*none;/);
    // 첫 실행 때 html·body 높이가 793이라, overflow를 막으면 852 높이의 틀 아래(하단 탭)가 잘린다
    expect(rootRules.filter(([, , body]) => /overflow(?:-[xy])?:\s*hidden/.test(body))).toEqual([]);
    expect(rootTags).toHaveLength(2);
    expect(rootTags.filter((tag) => /\boverflow(?:-[xy])?-hidden\b/.test(tag))).toEqual([]);
  });

  it("fixed는 Safari 탭에서만 보이는 설치 안내에서만 쓴다", () => {
    // 홈 화면 앱 첫 실행 때 fixed는 793 기준으로 잡혀, 하단 탭·떠 있는 버튼은 틀 안에 둔다
    // table-fixed·toFixed는 빼고, 클래스 fixed와 CSS position: fixed만 잡는다
    expect(findLines(/(?<![\w-])fixed(?![\w-])/, ["components/InstallHint.tsx"])).toEqual([]);
  });

  it("safe-area 여백은 틀·하단 탭·설치 안내에서만 정한다", () => {
    const allowed = [SHELL, "components/home/HomePager.tsx", "components/InstallHint.tsx"];

    expect(findLines(/safe-area-inset-(?:top|bottom)/, allowed)).toEqual([]);
  });
});
