import { describe, expect, it } from "vitest";
import { readSource, readSourceLines } from "@/test-utils/source";

// 홈 화면 앱에는 주소창과 브라우저 버튼이 없어, 오류·없는 주소 화면에서 빠져나갈 길이 화면 안에 있어야 한다(#83).
// Vitest(node)로는 오류 화면을 띄울 수 없어 소스 규칙으로 고정한다. 조회 실패 화면은 서버가 Supabase를 부르다 실패해야 떠서
// E2E에서 page.route로 만들 수 없다(#195). 없는 주소·기록·일정·항목 화면과, 화면을 받다 연결이 끊겨 나오는 오류 화면(error.tsx)의
// 알림·다시 시도·홈으로는 e2e/status-screens.spec.ts가 잰다(#258).

const GLOBAL_ERROR = "app/global-error.tsx";
const ERROR_SCREEN = "components/ErrorScreen.tsx";
const RETRY_BUTTON = "components/RetryButton.tsx";
const LOAD_ERROR_SCREEN = "components/LoadErrorScreen.tsx";
const LOAD_ERROR_MESSAGE = "components/LoadErrorMessage.tsx";
const STATUS_SCREEN = "components/StatusScreen.tsx";
const USE_RETRY = "lib/navigation/use-retry.ts";

describe("오류 화면", () => {
  it("다시 시도 버튼이 화면을 다시 불러온다", () => {
    expect(readSource("app/error.tsx")).toContain("<ErrorScreen onRetry={retry} />");
    // 다시 시도가 또 실패하면 React가 오류 화면을 새로 그려 화면 안의 상태가 사라지므로, 실패 횟수를 화면 밖에서 센다
    expect(readSource(ERROR_SCREEN)).toContain("useErrorRetry(onRetry)");
    expect(readSource(ERROR_SCREEN)).toContain("<RetryButton isPending={isPending} onRetry={retry} />");
    expect(readSource(USE_RETRY)).toContain("startTransition(() => onRetry())");
    expect(readSource("lib/navigation/use-error-retry.ts")).toContain("startTransition(() => onRetry())");
  });

  it("다시 시도하는 동안 눌렸다는 것을 보여 주고 다시 누를 수 없게 한다", () => {
    const source = readSource(RETRY_BUTTON);

    // disabled는 누른 순간 초점을 빼앗으므로 aria-disabled로 막고 누름도 무시한다
    expect(source).toContain("const isDisabled = isPending || isOffline;");
    expect(source).toContain("aria-disabled={isDisabled}");
    expect(source).toContain("if (!isDisabled) onRetry();");
    expect(source).not.toMatch(/\sdisabled=\{/);
    expect(source).toContain('isPending ? "다시 시도하는 중…" : "다시 시도"');
  });

  it("끊긴 동안에는 다시 시도를 누를 수 없게 하고 연결되면 누를 수 있다고 알린다", () => {
    // 끊긴 채로 누르면 연결될 때까지 기다리며, 그동안 돌아가는 링크를 눌러도 제자리에 있다가 연결되면 한꺼번에 옮겨 간다(#139)
    const source = readSource(RETRY_BUTTON);

    expect(source).toContain("const isOffline = useOffline();");
    // 다시 시도하는 중에 끊기면 그 시도가 연결을 기다리므로 다시 누르라는 안내는 보여 주지 않는다
    expect(source).toContain("const shouldShowOfflineHint = isOffline && !isPending;");
    expect(source).toMatch(/\{shouldShowOfflineHint && \(\s*<p id=\{hintId\}[^>]*>\s*연결되면 다시 시도할 수 있어요/);
  });

  it("다시 시도가 또 실패하면 바뀐 문구를 화면 읽기 프로그램에 다시 알린다", () => {
    // role="alert"는 내용이 바뀌어야 다시 읽으므로, 실패할 때마다 key로 새로 그린다
    expect(readSource(STATUS_SCREEN)).toMatch(/<div\s+key=\{failedRetryCount\}\s+role=\{isAlert \? "alert" : undefined\}/);
    expect(readSource(STATUS_SCREEN)).toContain("{getRetryMessage(description, failedRetryCount)}");
    for (const at of [ERROR_SCREEN, LOAD_ERROR_SCREEN]) {
      expect(readSource(at)).toContain("failedRetryCount={failedCount}");
    }
  });

  it("같은 문구로 또 실패하면 짧게 다시 나타나고, 동작 줄이기면 움직이지 않는다", () => {
    expect(readSource(STATUS_SCREEN)).toContain('shouldFlashRetryMessage(failedRetryCount) ? "retry-failed-flash" : ""');
    expect(readSource("app/globals.css")).toMatch(/@media \(prefers-reduced-motion: no-preference\) \{\s*\.retry-failed-flash \{/);
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
    for (const file of ["app/error.tsx", ERROR_SCREEN, LOAD_ERROR_SCREEN, GLOBAL_ERROR]) {
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
  it("없는 대상 안내 문구는 화면마다 따로 적지 않고 StatusScreen의 설명으로만 쓴다", () => {
    // 없는 주소·기록·일정·항목 화면이 안내와 돌아갈 링크를 보여 주는지는 e2e/status-screens.spec.ts가 잰다
    const copies = readSourceLines().flatMap(({ at, lines }) =>
      lines.flatMap((line, index) => (line.includes("지워졌거나 주소가 잘못됐어요") && !line.includes("description=") ? [`${at}:${index + 1}`] : [])),
    );
    expect(copies).toEqual([]);
  });
});

describe("고치기 화면의 조회 실패", () => {
  const EDIT_SCREENS = [
    { at: "app/dates/[id]/edit/page.tsx", title: "기록을 불러오지 못했어요", backHref: "RECORDS_PATH", backLabel: "기록 목록으로" },
    { at: "app/events/[id]/edit/page.tsx", title: "일정을 불러오지 못했어요", backHref: "CALENDAR_PATH", backLabel: "캘린더로" },
    { at: "app/todos/[id]/edit/page.tsx", title: "항목을 불러오지 못했어요", backHref: "TODOS_PATH", backLabel: "목록으로" },
  ] as const;

  it.each(EDIT_SCREENS)("$at 화면은 고치던 대상에 맞는 문구와 돌아갈 길을 보여 준다", ({ at, title, backHref, backLabel }) => {
    const source = readSource(at);

    expect(source).toContain(`<LoadErrorScreen title="${title}" backHref={${backHref}} backLabel="${backLabel}" />`);
  });

  it.each(EDIT_SCREENS)("$at 화면은 없음보다 오류를 먼저 확인한다", ({ at }) => {
    const lines = readSourceLines().find((file) => file.at === at)?.lines ?? [];
    const errorCheck = lines.findIndex((line) => /instanceof \w+LoadError/.test(line));
    const missingCheck = lines.findIndex((line) => /if \(!\w+\)/.test(line));

    expect(errorCheck).toBeGreaterThanOrEqual(0);
    expect(missingCheck).toBeGreaterThan(errorCheck);
  });

  it("다시 시도와 돌아가기를 함께 두고 화면 읽기 프로그램에 바로 알린다", () => {
    const source = readSource(LOAD_ERROR_SCREEN);

    expect(source).toContain("useRefreshRetry()");
    expect(source).toContain("<RetryButton isPending={isPending} onRetry={retry} />");
    expect(source).toContain("<StatusLink href={backHref}>");
    expect(source).toContain("isAlert");
  });

  it("다시 불러온 화면을 되돌아갈 때 또 불러오지 않게 표시한다", () => {
    // router.refresh()는 숨겨 둔 화면까지 비워 돌아갈 때 Next가 새로 받으므로, 표시가 없으면 같은 요청과 사진을 두 번 받는다
    const source = readSource(USE_RETRY);

    expect(source).toMatch(/markAllScreensLoaded\(\);\s*router\.refresh\(\);/);
  });
});

describe("화면 안 조회 실패 문구", () => {
  it.each(["app/records/page.tsx", "app/calendar/page.tsx", "app/todos/page.tsx", "app/records/map/page.tsx", "app/dates/[id]/page.tsx"])(
    "%s 화면은 같은 문구 틀을 쓴다",
    (at) => {
      expect(readSource(at)).toContain("<LoadErrorMessage message=");
    },
  );

  it("주소창과 새로고침이 없는 홈 화면 앱에서도 그 자리에서 다시 불러올 수 있다", () => {
    const source = readSource(LOAD_ERROR_MESSAGE);

    expect(source).toContain("useRefreshRetry()");
    expect(source).toContain("<RetryButton isPending={isPending} onRetry={retry} />");
  });

  it("다시 시도가 또 실패하면 바뀐 문구를 화면 읽기 프로그램에 다시 알린다", () => {
    const source = readSource(LOAD_ERROR_MESSAGE);

    expect(source).toMatch(/<p\s+key=\{failedCount\}\s+role="alert"/);
    expect(source).toContain("{getRetryMessage(message, failedCount)}");
    expect(source).toContain('shouldFlashRetryMessage(failedCount) ? "retry-failed-flash" : ""');
  });
});
