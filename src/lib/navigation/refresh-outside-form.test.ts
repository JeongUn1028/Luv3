import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSource } from "@/test-utils/source";
import { refreshOutsideForm } from "./refresh-outside-form";
import { isScreenStale, markAllScreensStale, markScreenLoaded } from "./screen-freshness";

const BASE_URL = "https://luv3.test/somewhere";

describe("refreshOutsideForm", () => {
  beforeEach(() => {
    markAllScreensStale();
  });

  it("폼이 아닌 화면을 보고 있으면 바로 새로 받는다", () => {
    // Arrange
    const refresh = vi.fn();

    // Act
    const isRefreshed = refreshOutsideForm(refresh, "/todos");

    // Assert
    expect(isRefreshed).toBe(true);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("폼을 쓰는 중이면 새로 받지 않고, 돌아갈 화면을 모두 오래된 것으로 쳐서 그때 새로 받게 한다", () => {
    // Arrange
    const refresh = vi.fn();
    markScreenLoaded("/", BASE_URL);
    markScreenLoaded("/todos", BASE_URL);

    // Act
    const isRefreshed = refreshOutsideForm(refresh, "/todos/new");

    // Assert
    expect(isRefreshed).toBe(false);
    expect(refresh).not.toHaveBeenCalled();
    expect(isScreenStale("/", BASE_URL)).toBe(true);
    expect(isScreenStale("/todos", BASE_URL)).toBe(true);
  });
});

describe("저장 뒤 새로 받기", () => {
  it("다른 화면의 저장이 끝나 새로 받는 곳은 폼을 쓰는 중인지 먼저 본다(#164)", () => {
    expect(readSource("components/home/CouplePhoto.tsx")).toContain("refreshOutsideForm(() => startRefresh(() => router.refresh()))");
    expect(readSource("components/todos/TodoList.tsx")).toContain("refreshOutsideForm(() => startTransition(() => router.refresh()))");
    expect(readSource("lib/navigation/use-leavable-save.ts")).toContain("refreshOutsideForm(() => router.refresh())");
  });
});
