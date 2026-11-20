import { describe, expect, it } from "vitest";
import { findTodoTab, toKeyboardTab, toTodoListView } from "./list-view";

describe("toTodoListView", () => {
  it("탭으로 저장했으면 탭 모양으로 본다", () => {
    // Arrange
    const value = "tabs";

    // Act
    const view = toTodoListView(value);

    // Assert
    expect(view).toBe("tabs");
  });

  it("구역으로 저장했으면 구역 모양으로 본다", () => {
    // Arrange
    const value = "sections";

    // Act
    const view = toTodoListView(value);

    // Assert
    expect(view).toBe("sections");
  });

  it.each([null, undefined, "", "grid"])("값이 %s이면 기본값인 구역 모양으로 본다", (value) => {
    // Arrange
    // Act
    const view = toTodoListView(value);

    // Assert
    expect(view).toBe("sections");
  });
});

describe("toKeyboardTab", () => {
  it("오른쪽 방향키를 누르면 다음 탭으로 간다", () => {
    // Arrange
    const current = "scheduled";

    // Act
    const next = toKeyboardTab(current, "ArrowRight");

    // Assert
    expect(next).toBe("unscheduled");
  });

  it("마지막 탭에서 오른쪽 방향키를 누르면 첫 탭으로 돈다", () => {
    // Arrange
    const current = "done";

    // Act
    const next = toKeyboardTab(current, "ArrowRight");

    // Assert
    expect(next).toBe("scheduled");
  });

  it("첫 탭에서 왼쪽 방향키를 누르면 마지막 탭으로 돈다", () => {
    // Arrange
    const current = "scheduled";

    // Act
    const next = toKeyboardTab(current, "ArrowLeft");

    // Assert
    expect(next).toBe("done");
  });

  it("왼쪽 방향키를 누르면 이전 탭으로 간다", () => {
    // Arrange
    const current = "done";

    // Act
    const next = toKeyboardTab(current, "ArrowLeft");

    // Assert
    expect(next).toBe("unscheduled");
  });

  it("Home·End를 누르면 첫 탭·마지막 탭으로 간다", () => {
    // Arrange
    const current = "unscheduled";

    // Act
    const tabs = [toKeyboardTab(current, "Home"), toKeyboardTab(current, "End")];

    // Assert
    expect(tabs).toEqual(["scheduled", "done"]);
  });

  it("다른 키를 누르면 옮겨 가지 않는다", () => {
    // Arrange
    const current = "unscheduled";

    // Act
    const next = toKeyboardTab(current, "Enter");

    // Assert
    expect(next).toBeUndefined();
  });
});

describe("findTodoTab", () => {
  const lists = { scheduled: [{ id: "s1" }], unscheduled: [{ id: "u1" }, { id: "u2" }], done: [{ id: "d1" }] };

  it("항목이 들어 있는 탭을 찾는다", () => {
    // Arrange
    const ids = ["s1", "u2", "d1"];

    // Act
    const tabs = ids.map((id) => findTodoTab(lists, id));

    // Assert
    expect(tabs).toEqual(["scheduled", "unscheduled", "done"]);
  });

  it("어느 탭에도 없으면 찾지 못한다", () => {
    // Arrange
    const id = "gone";

    // Act
    const tab = findTodoTab(lists, id);

    // Assert
    expect(tab).toBeUndefined();
  });
});
