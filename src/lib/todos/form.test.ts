import { describe, expect, it } from "vitest";
import { validateTodoContent } from "./form";

describe("validateTodoContent", () => {
  it("앞뒤 공백을 빼고 내용이 있으면 에러가 없다", () => {
    expect(validateTodoContent("  제주도 여행  ")).toBeUndefined();
  });

  it("공백만 있으면 내용을 적어 달라고 한다", () => {
    expect(validateTodoContent("   ")).toBe("하고 싶은 것을 적어 주세요.");
  });

  it("100자까지는 받고, 넘으면 글자 수 제한을 알린다", () => {
    expect(validateTodoContent("가".repeat(100))).toBeUndefined();
    expect(validateTodoContent("가".repeat(101))).toBe("100자까지 적을 수 있어요.");
  });

  it("이모지는 DB처럼 한 글자로 센다", () => {
    expect(validateTodoContent("😀".repeat(100))).toBeUndefined();
  });
});
