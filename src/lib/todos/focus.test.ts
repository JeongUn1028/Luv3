import { describe, expect, it } from "vitest";
import { requestTodoFocus, takeTodoFocus } from "./focus";

describe("하고 싶은 것 줄로 가기", () => {
  it("남긴 줄을 한 번만 꺼내고, 다시 꺼내면 비어 있다", () => {
    // Arrange
    requestTodoFocus("t1");

    // Act
    const first = takeTodoFocus();
    const second = takeTodoFocus();

    // Assert
    expect(first).toBe("t1");
    expect(second).toBeUndefined();
  });

  it("여러 번 남기면 마지막 줄로 간다", () => {
    requestTodoFocus("t1");
    requestTodoFocus("t2");

    expect(takeTodoFocus()).toBe("t2");
  });
});
