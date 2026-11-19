import { describe, expect, it } from "vitest";
import { toScheduleTodoHref, toTodoEditHref } from "./schedule";

describe("하고 싶은 것 일정 주소", () => {
  it("고치기 화면 주소를 만든다", () => {
    expect(toTodoEditHref("t1")).toBe("/todos/t1/edit");
  });

  it("일정 잡기는 새 일정 폼에 하고 싶은 것 id를 붙여 연다", () => {
    expect(toScheduleTodoHref("t1")).toBe("/events/new?todo=t1");
  });
});
