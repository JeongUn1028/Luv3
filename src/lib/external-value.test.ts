import { describe, expect, it, vi } from "vitest";
import { createExternalValue } from "./external-value";

describe("createExternalValue", () => {
  it("값을 바꾸면 새 값을 돌려주고 듣는 쪽에 알린다", () => {
    // Arrange
    const value = createExternalValue(0);
    const listener = vi.fn();
    value.subscribe(listener);

    // Act
    value.set(1);

    // Assert
    expect(value.get()).toBe(1);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("같은 값으로 바꾸면 알리지 않는다", () => {
    // Arrange
    const value = createExternalValue(false);
    const listener = vi.fn();
    value.subscribe(listener);

    // Act
    value.set(false);

    // Assert
    expect(listener).not.toHaveBeenCalled();
  });

  it("듣기를 그만두면 더는 알리지 않는다", () => {
    // Arrange
    const value = createExternalValue("a");
    const listener = vi.fn();
    const unsubscribe = value.subscribe(listener);

    // Act
    unsubscribe();
    value.set("b");

    // Assert
    expect(listener).not.toHaveBeenCalled();
  });
});
