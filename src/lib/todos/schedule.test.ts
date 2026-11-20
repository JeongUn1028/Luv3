import { describe, expect, it } from "vitest";
import { parsePickedTodoIds, pickLinkableTodos, toMissingPicksNotice, toPickedTodosScheduleHref, toScheduleTodoHref, toTodoEditHref } from "./schedule";

const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

describe("하고 싶은 것 일정 주소", () => {
  it("고치기 화면 주소를 만든다", () => {
    expect(toTodoEditHref("t1")).toBe("/todos/t1/edit");
  });

  it("일정 잡기는 새 일정 폼에 하고 싶은 것 id를 붙여 연다", () => {
    expect(toScheduleTodoHref("t1")).toBe("/events/new?todo=t1");
  });

  it("목록에서 고른 것으로 일정을 잡으면 고른 id를 모두 pick으로 붙인다(#495)", () => {
    expect(toPickedTodosScheduleHref([A, B])).toBe(`/events/new?pick=${A}&pick=${B}`);
  });
});

describe("parsePickedTodoIds", () => {
  it("하나면 배열 하나로, 여럿이면 그대로 읽는다", () => {
    expect(parsePickedTodoIds(A)).toEqual([A]);
    expect(parsePickedTodoIds([A, B])).toEqual([A, B]);
  });

  it("없으면 빈 배열을 돌려준다", () => {
    expect(parsePickedTodoIds(undefined)).toEqual([]);
  });

  it("id 형식이 아니면 빼고, 같은 id가 두 번 오면 하나만 남긴다", () => {
    expect(parsePickedTodoIds([A, "nope", A, B])).toEqual([A, B]);
  });
});

describe("pickLinkableTodos", () => {
  const sashimi = { id: A, content: "회 먹기" };
  const yacht = { id: B, content: "요트 타기" };
  const exhibition = { id: C, content: "전시 보기" };
  const linkable = [sashimi, yacht, exhibition];

  it("고른 것을 목록 순서대로 돌려준다(누른 순서와 상관없이 첫 번째가 제목이 된다)", () => {
    expect(pickLinkableTodos(linkable, [C, A])).toEqual({ picked: [sashimi, exhibition], missingCount: 0 });
  });

  it("그사이 일정이 잡혔거나 지워져 이을 수 없는 것은 빼고 개수를 센다", () => {
    expect(pickLinkableTodos([yacht], [A, B])).toEqual({ picked: [yacht], missingCount: 1 });
  });
});

describe("toMissingPicksNotice", () => {
  it("뺀 개수를 알린다", () => {
    expect(toMissingPicksNotice(2)).toBe("고른 것 중 2개는 그사이 일정이 잡혔거나 완료·삭제돼서 뺐어요.");
  });
});
