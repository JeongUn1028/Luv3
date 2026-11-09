import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSource } from "@/test-utils/source";
import { markNavigationStart, refreshOutsideForm } from "./refresh-outside-form";
import { isScreenStale, markAllScreensStale, markScreenLoaded } from "./screen-freshness";

const BASE_URL = "https://luv3.test/somewhere";

describe("refreshOutsideForm", () => {
  beforeEach(() => {
    markAllScreensStale();
  });

  it("폼이 아닌 화면을 보고 있으면 바로 새로 받는다", () => {
    // Arrange
    const refresh = vi.fn();
    markNavigationStart("/todos", BASE_URL);

    // Act
    const isRefreshed = refreshOutsideForm(refresh);

    // Assert
    expect(isRefreshed).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("폼을 쓰는 중이면 새로 받지 않고, 돌아갈 화면을 모두 오래된 것으로 쳐서 그때 새로 받게 한다", () => {
    // Arrange
    const refresh = vi.fn();
    markScreenLoaded("/", BASE_URL);
    markScreenLoaded("/todos", BASE_URL);
    markNavigationStart("/todos/new", BASE_URL);

    // Act
    const isRefreshed = refreshOutsideForm(refresh);

    // Assert
    expect(isRefreshed).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(isScreenStale("/", BASE_URL)).toBe(true);
    expect(isScreenStale("/todos", BASE_URL)).toBe(true);
  });

  it("주소창이 바뀌기 전이라도 폼으로 옮기는 중이면 미루고, 폼에서 나가는 중이면 새로 받는다", () => {
    // Arrange
    const refresh = vi.fn();

    // Act: 목록에서 폼 링크를 누른 직후, 폼에서 목록으로 나가는 직후
    markNavigationStart("/todos/new", "https://luv3.test/todos");
    const isRefreshedWhileEntering = refreshOutsideForm(refresh);
    markNavigationStart("https://luv3.test/todos?from=form", "https://luv3.test/todos/new");
    const isRefreshedWhileLeaving = refreshOutsideForm(refresh);

    // Assert
    expect([isRefreshedWhileEntering, isRefreshedWhileLeaving]).toEqual([false, true]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("저장 뒤 새로 받기", () => {
  // 커플 사진과 폼 저장 뒤의 새로 받기가 폼을 지키는지는 e2e/refresh-keeps-form.spec.ts와 e2e/leave-while-saving.spec.ts가 잰다.
  // Todo 체크는 E2E에서 새로 받기가 입력보다 먼저 끝날 수 있어 놓치므로 여기서 고정한다
  it("Todo 체크 뒤 새로 받기는 폼을 쓰는 중인지 먼저 보고, 커플 사진 저장을 미뤘으면 숨겨진 홈에 초점 옮기기를 남기지 않는다(#164)", () => {
    expect(readSource("components/todos/TodoList.tsx")).toContain("refreshOutsideForm(() => startTransition(() => router.refresh()))");
    expect(readSource("components/home/CouplePhoto.tsx")).toContain("shouldMoveFocusRef.current = refreshOutsideForm(");
  });

  it("화면 이동을 시작할 때 가는 곳을 적어, 주소창이 바뀌기 전에도 폼으로 옮기는 중인지 안다", () => {
    // 되돌아가기(traverse)까지 모든 이동에서 적어야 한다. 되돌아간 뒤 저장이 끝나는 경우는 E2E가 지나지 않는다
    expect(readSource("instrumentation-client.ts")).toMatch(
      /onRouterTransitionStart = \(url: string, navigationType: "push" \| "replace" \| "traverse"\): void => \{\s*markNavigationStart\(url, window\.location\.href\);/,
    );
  });
});
