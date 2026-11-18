import { describe, expect, it } from "vitest";
import { refreshTab, registerTabRefresh } from "./tab-refresh";

describe("refreshTab", () => {
  it("등록한 탭의 새로 받기를 부른다", () => {
    // Arrange
    let calls = 0;
    const unregister = registerTabRefresh("todos", () => {
      calls += 1;
    });

    // Act
    refreshTab("todos");
    unregister();

    // Assert
    expect(calls).toBe(1);
  });

  it("다른 탭이나 숨겨져 등록이 지워진 탭은 부르지 않는다", () => {
    // Arrange
    let calls = 0;
    const unregister = registerTabRefresh("todos", () => {
      calls += 1;
    });
    unregister();

    // Act
    refreshTab("todos");
    refreshTab("records");

    // Assert
    expect(calls).toBe(0);
  });

  it("예전 화면의 정리가 나중에 돌아도 새로 등록한 탭을 지우지 않는다", () => {
    // Arrange
    let calls = 0;
    const unregisterOld = registerTabRefresh("todos", () => undefined);
    const unregisterNew = registerTabRefresh("todos", () => {
      calls += 1;
    });

    // Act
    unregisterOld();
    refreshTab("todos");
    unregisterNew();

    // Assert
    expect(calls).toBe(1);
  });
});
