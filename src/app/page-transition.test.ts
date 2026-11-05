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
    const [backLink] = findLinks("components/BackLink.tsx");
    const [headerLink] = findLinks("components/ScreenHeader.tsx");
    expect(backLink).toMatch(/transitionTypes=\{BACK_TRANSITION\}/);
    expect(headerLink).toMatch(/transitionTypes=\{FORWARD_TRANSITION\}/);
  });

  it("뒤로 버튼 움직임은 Next가 시작한 되돌아가기 안에서 붙이고, 그 전환이 건너뛰어지지 않게 Next보다 먼저 듣는다", () => {
    // 움직임이 사라져도 Vitest로는 알 수 없으므로 실제 움직임은 e2e/back-navigation.spec.ts가 잰다
    expect(readSource("instrumentation-client.ts")).toMatch(/onRouterTransitionStart[\s\S]*claimBackMotion\(\)[\s\S]*addTransitionType/);
    expect(readSource("app/layout.tsx")).toContain("<HistoryReturn />");
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

    expect(css).toContain(`::view-transition-new(.${name})`);
  });

  it("이전 화면은 전환 시작부터 보이지 않아 새 화면과 겹치지 않는다", () => {
    const css = readSource("app/globals.css");

    // 화면 배경이 투명해서 이전 화면이 보이는 동안에는 새 화면과 겹쳐 비친다(#88)
    expect(css).toMatch(/::view-transition-old\(\*\)\s*\{[^}]*animation: none;[^}]*opacity: 0;/);
    expect(css.match(/::view-transition-old\([^)]*\)/g)).toEqual(["::view-transition-old(*)"]);
  });

  it("새 화면은 빈 시간 없이 바로 나타난다", () => {
    const css = readSource("app/globals.css");

    // 지연 시간이 있으면 이전 화면이 사라진 뒤 그만큼 빈 화면이 보인다. 시작 화면(#131)의 움직임은 화면 전환이 아니라 대상에서 뺀다
    const transitionRules = css.match(/::view-transition[^{]*\{[^}]*\}/g)?.join("\n");
    expect(transitionRules).toMatch(/\d+ms\s+[\w-]+\s+both/);
    expect(transitionRules).not.toMatch(/\d+ms\s+[\w-]+\s+\d+ms/);
    // 머리글·하단 탭처럼 움직이지 않는 부분은 흐려지지 않고 바로 바뀐다
    expect(css).toMatch(/::view-transition-new\(root\)\s*\{[^}]*animation: none;/);
  });

  it("뼈대는 움직임 없이 내용으로 바로 바뀐다", () => {
    // 뼈대를 내용 위에서 지우면 그동안 둘이 겹쳐 보인다(#88)
    expect(readSource("app/globals.css")).not.toContain(".reveal");
    expect(readSource("components/LoadingSuspense.tsx")).toMatch(
      /<ViewTransition enter=\{SCREEN_MOTION\} exit=\{SCREEN_MOTION\} default="none">/,
    );
    // 내용에 움직임을 주면 전환하는 동안 그 영역을 누를 수 없다(달 이동, Todo 순서 버튼)
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
  it("화면은 LoadingSuspense로 불러와 기다리는 동안 뼈대를 보여 준다", () => {
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
