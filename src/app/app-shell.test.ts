import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

// 홈 화면 앱을 처음 띄우면 iOS가 뷰포트를 상태바만큼 작게(852 → 793) 알리고, 그동안 fixed 요소도 793 기준으로 그린다(#51).
// 문서 스크롤 대신 화면 틀(PageShell) 안쪽에서만 스크롤하게 하고, 틀·하단 탭·safe-area 규칙을 한곳에 모은다(#63, #58).
// Vitest(node)로는 레이아웃을 잴 수 없어 소스 규칙으로 고정한다.

const SHELL = "components/PageShell.tsx";
// 루트 레이아웃까지 실패했을 때의 최후의 화면은 일반 화면 코드에 기대지 않고 직접 그린다(#83)
const GLOBAL_ERROR = "app/global-error.tsx";
// 화면 위쪽에 겹쳐 뜨는 안내. 첫 실행 때 줄어드는 것은 아래쪽 높이라 위쪽 기준 fixed는 어긋나지 않는다
const TOP_OVERLAYS = ["components/InstallHint.tsx", "components/SaveNotices.tsx"];

const findLines = (pattern: RegExp, allowed: readonly string[]): string[] =>
  readSourceLines().flatMap(({ at, lines }) =>
    allowed.includes(at)
      ? []
      : lines.flatMap((line, index) => (pattern.test(line) ? [`${at}:${index + 1}`] : [])),
  );

describe("화면 틀", () => {
  it("화면의 main은 PageShell에서만 만든다", () => {
    expect(findLines(/<main\b/, [SHELL, GLOBAL_ERROR])).toEqual([]);
  });

  it("루트 레이아웃이 화면 높이(h-app)를 고정하고 PageShell은 그 안을 채워 안쪽 영역만 스크롤한다", () => {
    const shell = readSource(SHELL);

    expect(readSource("app/layout.tsx")).toMatch(/<div className="[^"]*\bflex\b[^"]*\bh-app\b[^"]*\bflex-col\b[^"]*">\s*<OfflineNotice \/>\s*\{children\}\s*<\/div>/);
    // 화면 제목(h1)이 본문 영역 안에 남도록 머리글도 main 안에 둔다
    expect(shell).toMatch(/<main className="[^"]*\bmin-h-0\b[^"]*\bflex-1\b[^"]*\bflex-col\b[^"]*">\s*<div className="shrink-0 pt-\[var\(--screen-top-inset\)\]">\{header\}<\/div>/);
    // min-h-0이 없으면 flex 자식이 내용만큼 늘어나 안쪽 스크롤이 생기지 않는다
    expect(shell).toMatch(/"[^"]*\bmin-h-0\b[^"]*\bflex-1\b[^"]*\boverflow-y-auto\b[^"]*\boverscroll-contain\b[^"]*"/);
  });

  it("하단 탭은 스크롤 영역 아래, 화면 높이 틀 안에 둔다", () => {
    const shell = readSource(SHELL);

    // fixed 대신 높이 틀의 마지막 자식으로 두어야 첫 실행 때(793) 하단 탭이 위로 뜨지 않는다
    expect(shell).toMatch(/<\/main>\s*<\/ViewTransition>\s*\{footer && \(\s*<ViewTransition[^>]*>\s*\{footer\}\s*<\/ViewTransition>\s*\)\}\s*<\/>/);
    // 아래 safe-area는 하단 탭이 채우므로, 하단 탭이 있는 화면은 내용 아래 여백을 따로 두지 않는다
    expect(shell).toMatch(/footer \? "" : BOTTOM_SPACE\[bottomSpace\]/);
  });

  it.each([
    ["app/page.tsx", "home"],
    ["app/records/page.tsx", "records"],
    ["app/calendar/page.tsx", "calendar"],
    ["app/todos/page.tsx", "todos"],
  ])("탭 화면 %s는 하단 탭이 붙은 공통 틀(%s)을 쓴다", (at, tab) => {
    expect(readSource(at)).toMatch(new RegExp(`<TabScreen\\b[^>]*\\btab="${tab}"`));
  });

  it("예전 홈 주소(?view=)를 만드는 코드가 남지 않는다", () => {
    // 기록·캘린더를 한 화면에서 넘기던 때의 주소다. 이제 탭마다 주소가 따로 있다(#58)
    expect(findLines(/[?&]view=/, [])).toEqual([]);
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

  it.each(TOP_OVERLAYS)("위쪽에 겹쳐 뜨는 안내 %s는 끊김 안내 아래에 놓인다", (at) => {
    // 끊김 안내가 떠 있으면 --overlay-top이 그 아래를 가리킨다(#106)
    expect(readSource(at)).toMatch(/\btop-\[calc\(var\(--overlay-top\)\+\d+px\)\]/);
  });

  it("끊긴 동안에는 오류 화면의 홈으로 링크가 문서를 새로 받지 않는다", () => {
    // 일반 a 링크라 끊긴 채로 누르면 브라우저 오류 화면으로 바뀐다(#106). 오류 화면은 E2E로 띄우기 어려워 소스로 고정한다
    expect(readSource("components/ErrorScreen.tsx")).toMatch(/if \(isOffline\) event\.preventDefault\(\)/);
  });

  it("fixed는 화면 위쪽에 겹치는 요소에서만 쓴다", () => {
    // 홈 화면 앱 첫 실행 때 fixed는 793 기준으로 잡혀, 하단 탭·떠 있는 버튼은 틀 안에 둔다
    // table-fixed·toFixed는 빼고, 클래스 fixed와 CSS position: fixed만 잡는다
    // 시작 화면은 화면 전체를 덮지만 맨 위에서 시작하고 높이를 h-app으로 직접 정한다
    expect(findLines(/(?<![\w-])fixed(?![\w-])/, [...TOP_OVERLAYS, "components/StartupSplash.tsx"])).toEqual([]);
  });

  it("safe-area 여백은 틀·하단 탭과 위쪽 여백 변수에서만 정한다", () => {
    const allowed = [SHELL, GLOBAL_ERROR, "components/tabs/TabBar.tsx", "app/globals.css"];

    expect(findLines(/safe-area-inset-(?:top|bottom)/, allowed)).toEqual([]);
  });
});

describe("입력 칸", () => {
  it("iOS가 눌렀을 때 화면을 확대하지 않도록 입력 칸은 16px이다", () => {
    // iOS는 글자가 16px보다 작은 칸을 누르면 화면을 확대한다(#90).
    // @layer 밖의 규칙이라 Tailwind 유틸리티보다 우선하고, 앞으로 만드는 칸에도 적용된다
    expect(readSource("app/globals.css")).toMatch(/\binput,\s*textarea,\s*select\s*\{\s*font-size: 16px;/);
  });

  it("입력 칸 클래스에 16px보다 작은 글자 크기를 적지 않는다", () => {
    const small = readSourceLines().flatMap(({ at }) => {
      if (!at.endsWith(".tsx")) return [];
      const source = readSource(at);
      const classNames = [
        ...[...source.matchAll(/const inputClassName =\s*"([^"]*)"/g)].map((match) => match[1]),
        ...[...source.matchAll(/<(?:input|textarea|select)\b[\s\S]*?\/>/g)].flatMap((match) => match[0].match(/className="[^"]*"/g) ?? []),
      ];
      return classNames.filter((className) => /text-\[(?:\d|1[0-5])px\]/.test(className)).map((className) => `${at}: ${className.slice(0, 60)}`);
    });

    expect(small).toEqual([]);
  });

  it("손가락으로 벌려 확대하는 기능은 막지 않는다", () => {
    expect(readSource("app/layout.tsx")).not.toMatch(/maximumScale|userScalable/);
  });
});

describe("누름 영역", () => {
  it("홈 칸이 비었을 때의 추가 링크는 세로 44px이다", () => {
    // 일정이 없는 상태는 E2E 데이터와 맞지 않아 클래스로 고정한다(#105)
    const link = readSource("components/home/HomeTile.tsx").match(/<Link href=\{action\.href\}[^>]*>/)?.[0] ?? "";

    expect(link).toContain("h-11");
  });

  it("완료한 줄의 빈 칸은 순서 버튼 두 개 너비와 같아 이름표 오른쪽 끝이 위 목록과 같은 세로줄에 온다", () => {
    // 완료한 줄은 공유 데이터를 바꿔야 나와 E2E 대신 클래스로 고정한다(#105)
    const source = readSource("components/todos/TodoList.tsx");

    expect(source).toMatch(/MOVE_BUTTON_CLASS_NAME =\s*"flex size-11 /);
    expect(source).toContain('className="w-22 shrink-0"');
  });
});

describe("날짜·시간 칸", () => {
  it("폼의 날짜 칸은 일요일부터 시작하는 앱 전용 창을 쓴다", () => {
    // type="date"는 아이폰이 창을 그려 시작 요일을 정할 수 없다(#178)
    expect(readSource("components/dates/DateRecordForm.tsx")).not.toContain(`type="date"`);
    expect(readSource("components/events/EventForm.tsx")).not.toContain(`type="date"`);
  });

  it("iOS 기본 모양을 꺼서 다른 칸과 같은 폭·높이를 따른다", () => {
    // iOS의 기본 모양 시간 칸은 width·height를 따르지 않고 부모보다 커질 수 있다(#92)
    const rule = readSource("app/globals.css").match(/input\[type="time"\]\s*\{[^}]*\}/)?.[0] ?? "";

    expect(rule).toContain("-webkit-appearance: none;");
    expect(rule).toContain("appearance: none;");
    expect(rule).toContain("min-width: 0;");
    expect(rule).toContain("max-width: 100%;");
  });

  it("iOS에서는 기본 배치를 유지해 값이 칸의 세로 가운데에 놓인다", () => {
    // iOS 기본 스타일은 inline-flex + align-items: center로 가운데를 맞춘다. block으로 바꾸면 값이 위로 올라간다(#96)
    const rule = readSource("app/globals.css").match(/@supports \(-webkit-touch-callout: none\)\s*\{[^}]*\}/)?.[0] ?? "";

    expect(rule).toContain("display: flex;");
    expect(rule).toContain("align-items: center;");
  });

  it("다른 브라우저에서는 시계 아이콘이 칸 오른쪽에 남도록 block을 쓴다", () => {
    // Chrome은 flex로 두면 시계 아이콘이 값 바로 옆으로 붙는다(#96)
    const rule = readSource("app/globals.css").match(/input\[type="time"\]\s*\{[^}]*\}/)?.[0] ?? "";

    expect(rule).toContain("display: block;");
  });

  it("시간 값은 다른 칸처럼 왼쪽에 놓인다", () => {
    expect(readSource("app/globals.css")).toMatch(/::-webkit-date-and-time-value\s*\{[^}]*text-align: left;/);
  });

  it("스크롤 영역은 칸이 넘쳐도 옆으로 움직이지 않는다", () => {
    expect(readSource(SHELL)).toMatch(/"[^"]*\boverflow-x-hidden\b[^"]*\boverflow-y-auto\b[^"]*"/);
  });
});
