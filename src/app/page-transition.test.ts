import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

// 화면 이동 방향(앞으로·뒤로·탭)은 링크마다 붙이지 않으면 조용히 애니메이션 없이 바뀐다(#53).
// Vitest(node)로는 전환을 볼 수 없어 소스 규칙으로 고정하고, 실제 움직임은 영상으로 확인한다.

const findLinks = (at: string): string[] => readSource(at).match(/<Link\b[\s\S]*?>/g) ?? [];

describe("화면 전환", () => {
  it("화면 틀은 머리글·내용과 하단 탭을 따로 움직여 탭끼리 옮길 때 하단 탭이 그대로 있다", () => {
    const shell = readSource("components/PageShell.tsx");

    // DOM 요소 안쪽의 ViewTransition은 화면이 들어오고 나갈 때 돌지 않으므로, 맨 바깥에 DOM 요소를 두지 않는다
    expect(shell).toMatch(/\(\s*(?:\n\s*)*<>\s*<ViewTransition enter=\{SCREEN_MOTION\} exit=\{SCREEN_MOTION\} default="none">\s*<main\b/);
    expect(shell).toMatch(/<ViewTransition enter=\{SLIDE_MOTION\} exit=\{SLIDE_MOTION\} default="none">\s*\{footer\}/);
  });

  it("하단 탭 링크는 탭 전환, 뒤로 가기 링크는 뒤로, 머리글 추가 버튼은 앞으로 움직인다", () => {
    expect(findLinks("components/tabs/TabBar.tsx").join()).toMatch(/transitionTypes=\{TAB_TRANSITION\}/);
    const [backLink, headerLink] = findLinks("components/ScreenHeader.tsx");
    expect(backLink).toMatch(/transitionTypes=\{BACK_TRANSITION\}/);
    expect(headerLink).toMatch(/transitionTypes=\{FORWARD_TRANSITION\}/);
  });

  it("화면을 옮기는 링크는 방향을 빠뜨리지 않는다", () => {
    // 달 이동(scroll={false})만 같은 화면 안의 이동이라 방향이 없다
    const missing = readSourceLines().flatMap(({ at }) =>
      at.endsWith(".tsx")
        ? findLinks(at)
            .filter((link) => !link.includes("transitionTypes") && !link.includes("scroll={false}"))
            .map((link) => `${at}: ${link.slice(0, 60)}`)
        : [],
    );

    expect(missing).toEqual([]);
  });

  it.each([
    ["components/dates/DateRecordForm.tsx"],
    ["components/dates/DeleteRecordButton.tsx"],
    ["components/events/EventForm.tsx"],
    ["components/todos/TodoForm.tsx"],
  ])("%s는 저장·삭제 뒤 뒤로 가는 방향으로 움직인다", (at) => {
    expect(readSource(at)).toMatch(/router\.replace\([^;]*transitionTypes: BACK_TRANSITION/);
  });

  it.each([["nav-forward"], ["nav-back"], ["nav-tab"]])("움직임 %s의 CSS가 있다", (name) => {
    const css = readSource("app/globals.css");

    expect(css).toContain(`::view-transition-old(.${name})`);
    expect(css).toContain(`::view-transition-new(.${name})`);
  });

  it("뼈대는 실제 내용 위에서 사라지기만 한다", () => {
    const css = readSource("app/globals.css");

    expect(css).toContain("::view-transition-old(.reveal)");
    // 내용에 움직임을 주면 전환하는 동안 그 영역을 누를 수 없다(달 이동, Todo 순서 버튼)
    expect(css).not.toContain("::view-transition-new(.reveal)");
    expect(readSource("components/PageShell.tsx")).not.toContain("update=");
  });

  it("모션 줄이기 설정이면 전환 애니메이션을 끈다", () => {
    expect(readSource("app/globals.css")).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{[^}]*::view-transition-group\(\*\)[^}]*animation-duration: 0s/,
    );
  });

  it("전환 덮개가 움직이지 않는 영역의 터치를 막지 않는다", () => {
    expect(readSource("app/globals.css")).toMatch(/::view-transition\s*\{[^}]*pointer-events: none/);
  });
});

describe("로딩 표시", () => {
  it("화면은 뼈대가 부드럽게 사라지는 LoadingSuspense로 불러온다", () => {
    // 로그인은 세션을 기다리지 않고 주소 쿼리만 읽어 뼈대가 필요 없다
    const raw = readSourceLines().flatMap(({ at, lines }) =>
      at.startsWith("app/") && at !== "app/login/page.tsx"
        ? lines.flatMap((line, index) => (/<Suspense\b/.test(line) ? [`${at}:${index + 1}`] : []))
        : [],
    );

    expect(raw).toEqual([]);
  });

  it.each([["components/home/HomeSkeletons.tsx"], ["components/Skeleton.tsx"]])(
    "%s는 스크린 리더에 불러오는 중임을 알린다",
    (at) => {
      expect(readSource(at)).toMatch(/role="status"/);
    },
  );

  it("설정 화면 뼈대도 불러오는 중임을 알린다", () => {
    expect(readSource("app/settings/page.tsx")).toContain("<SkeletonArea");
  });

  it("뼈대의 깜빡임은 모션 줄이기 설정이면 멈춘다", () => {
    const pulses = readSourceLines().flatMap(({ at, lines }) =>
      lines.flatMap((line, index) => (/(?<!motion-safe:)animate-pulse/.test(line) ? [`${at}:${index + 1}`] : [])),
    );

    expect(pulses).toEqual([]);
    expect(readSource("components/Skeleton.tsx")).toContain("motion-safe:animate-pulse");
  });
});

describe("스크롤 위치", () => {
  it("탭 화면은 탭 이름으로 위치를 기억한다", () => {
    expect(readSource("components/tabs/TabScreen.tsx")).toContain("scrollKey={tab}");
  });

  it("새 기록을 저장하면 맨 위의 새 기록이 보이도록 기록 탭의 위치를 지운다", () => {
    expect(readSource("components/dates/DateRecordForm.tsx")).toMatch(/if \(!record\) forgetScrollPosition\("records"/);
  });

  it("화면 틀은 기억할 이름을 스크롤 영역에 넘긴다", () => {
    expect(readSource("components/PageShell.tsx")).toMatch(/<ScrollArea\b[^>]*\bscrollKey=\{scrollKey\}/);
  });
});
