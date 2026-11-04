import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

// 홈 화면 앱에는 주소창과 브라우저 버튼이 없어, 오류·없는 주소 화면에서 빠져나갈 길이 화면 안에 있어야 한다(#83).
// Vitest(node)로는 오류 화면을 띄울 수 없어 소스 규칙으로 고정하고, 실제 동작은 프로덕션 빌드로 확인한다.

const GLOBAL_ERROR = "app/global-error.tsx";
const ERROR_SCREEN = "components/ErrorScreen.tsx";

describe("오류 화면", () => {
  it("다시 시도 버튼이 화면을 다시 불러온다", () => {
    expect(readSource("app/error.tsx")).toContain("<ErrorScreen onRetry={retry} />");
    expect(readSource(ERROR_SCREEN)).toContain("startTransition(() => onRetry())");
  });

  it("다시 시도하는 동안 눌렸다는 것을 보여 주고 다시 누를 수 없게 한다", () => {
    const source = readSource(ERROR_SCREEN);

    expect(source).toContain("disabled={isPending}");
    expect(source).toContain('isPending ? "다시 시도하는 중…" : "다시 시도"');
  });

  it("홈으로 링크는 문서를 새로 받는다", () => {
    // 화면 전환 링크는 홈에서 난 오류를 지우지 못하고, 배포 뒤 옛 JS 때문에 난 오류도 고치지 못한다
    const source = readSource(ERROR_SCREEN);

    expect(source).toMatch(/<a\s+href=\{HOME_PATH\}/);
    expect(source).not.toContain("StatusLink");
  });

  it("화면 읽기 프로그램에 오류를 바로 알린다", () => {
    expect(readSource(ERROR_SCREEN)).toContain("isAlert");
    expect(readSource("components/StatusScreen.tsx")).toContain('role={isAlert ? "alert" : undefined}');
    expect(readSource(GLOBAL_ERROR)).toContain('role="alert"');
  });

  it("오류 메시지 원문과 내부 식별자를 화면에 보여 주지 않는다", () => {
    for (const file of ["app/error.tsx", ERROR_SCREEN, GLOBAL_ERROR]) {
      const source = readSource(file);

      expect(source).not.toContain("error.message");
      expect(source).not.toContain("digest");
    }
  });
});

describe("최후의 오류 화면", () => {
  it("일반 화면 코드가 오류의 원인이어도 그릴 수 있게 PageShell과 안내 화면을 쓰지 않는다", () => {
    const source = readSource(GLOBAL_ERROR);

    expect(source).not.toContain("PageShell");
    expect(source).not.toContain("StatusScreen");
    expect(source).not.toContain("ErrorScreen");
    expect(source).not.toContain("next/link");
  });

  it("자기 문서로 다시 시도와 홈으로 가는 길을 그린다", () => {
    const source = readSource(GLOBAL_ERROR);

    expect(source).toContain('import "./globals.css"');
    expect(source).toContain('<html lang="ko"');
    expect(source).toContain("onClick={() => retry()}");
    expect(source).toMatch(/<a\s+href=\{HOME_PATH\}/);
  });

  it("루트 레이아웃과 같은 화면 틀을 쓴다", () => {
    const frame = "mx-auto flex h-app w-full max-w-[430px] flex-col";

    expect(readSource("app/layout.tsx")).toContain(frame);
    expect(readSource(GLOBAL_ERROR)).toContain(frame);
  });

  it("홈 화면 앱과 검색 차단에 필요한 메타를 직접 둔다", () => {
    const source = readSource(GLOBAL_ERROR);

    // 이 설정이 있어야 safe-area 값이 0이 아니게 된다
    expect(source).toContain("viewport-fit=cover");
    expect(source).toContain('name="apple-mobile-web-app-status-bar-style" content="black-translucent"');
    expect(source).toContain('name="robots" content="noindex, nofollow"');
  });
});

describe("찾을 수 없음 화면", () => {
  it("없는 주소에서 홈으로 가는 링크를 보여 준다", () => {
    expect(readSource("app/not-found.tsx")).toContain("<StatusLink href={HOME_PATH}>");
  });

  it("없는 기록·일정·항목 화면은 같은 틀을 쓴다", () => {
    for (const file of ["app/dates/[id]/not-found.tsx", "app/events/[id]/edit/page.tsx", "app/todos/[id]/edit/page.tsx"]) {
      expect(readSource(file)).toContain("<StatusScreen");
    }

    const copies = readSourceLines().flatMap(({ at, lines }) =>
      lines.flatMap((line, index) => (line.includes("지워졌거나 주소가 잘못됐어요") && !line.includes("description=") ? [`${at}:${index + 1}`] : [])),
    );
    expect(copies).toEqual([]);
  });
});
