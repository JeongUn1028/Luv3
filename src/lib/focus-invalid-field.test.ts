import { describe, expect, it, vi } from "vitest";
import { focusFirstInvalidField, INVALID_FIELD_SELECTOR } from "./focus-invalid-field";

const createField = () => ({ focus: vi.fn(), scrollIntoView: vi.fn() });

describe("focusFirstInvalidField", () => {
  it("오류 칸이 있으면 화면이 튀지 않게 초점을 준 뒤 가운데로 스크롤한다", () => {
    // Arrange
    const field = createField();
    const querySelector = vi.fn(() => field);

    // Act
    focusFirstInvalidField({ querySelector } as unknown as HTMLFormElement);

    // Assert
    expect(querySelector).toHaveBeenCalledWith(INVALID_FIELD_SELECTOR);
    expect(field.focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(field.scrollIntoView).toHaveBeenCalledWith({ block: "center" });
  });

  it("오류 칸이 없으면 아무것도 하지 않는다", () => {
    // Arrange
    const querySelector = vi.fn(() => null);

    // Act + Assert
    expect(() => focusFirstInvalidField({ querySelector } as unknown as HTMLFormElement)).not.toThrow();
  });
});
