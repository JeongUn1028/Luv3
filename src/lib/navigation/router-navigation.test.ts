import { describe, expect, it } from "vitest";
import { getLastRouterNavigation, isReopenedByLink, markRouterNavigation } from "./router-navigation";

describe("markRouterNavigation", () => {
  it("이동마다 번호를 늘리고 되돌아가기인지 적는다", () => {
    // Arrange
    const before = getLastRouterNavigation().id;

    // Act
    markRouterNavigation("push");
    const pushed = getLastRouterNavigation();
    markRouterNavigation("traverse");

    // Assert
    expect(pushed).toEqual({ id: before + 1, isTraverse: false });
    expect(getLastRouterNavigation()).toEqual({ id: before + 2, isTraverse: true });
  });
});

describe("isReopenedByLink", () => {
  it("지난번과 다른 이동이 링크 이동이면 링크로 다시 연 것이다", () => {
    expect(isReopenedByLink(3, { id: 5, isTraverse: false })).toBe(true);
  });

  it("되돌아가기로 돌아왔으면 아니다", () => {
    expect(isReopenedByLink(3, { id: 5, isTraverse: true })).toBe(false);
  });

  it("처음 그린 화면이거나 같은 이동이면 아니다", () => {
    expect([isReopenedByLink(undefined, { id: 5, isTraverse: false }), isReopenedByLink(5, { id: 5, isTraverse: false })]).toEqual([false, false]);
  });
});
