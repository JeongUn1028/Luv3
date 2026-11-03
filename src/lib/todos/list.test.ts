import { describe, expect, it } from "vitest";
import { applyTodoAction, groupTodos, toTodo, type Todo } from "./list";

const createTodo = (overrides: Partial<Todo> & Pick<Todo, "id">): Todo => ({
  content: `할 일 ${overrides.id}`,
  sortOrder: 1,
  completedAt: undefined,
  authorNickname: "정운",
  ...overrides,
});

const toIds = (todos: Todo[]): string[] => todos.map(({ id }) => id);

describe("toTodo", () => {
  it("DB 행의 작성자를 닉네임으로, 완료 시각 null을 undefined로 바꾼다", () => {
    // Arrange
    const row = {
      id: "t1",
      content: "제주도 여행",
      sort_order: 3,
      completed_at: null,
      author: { nickname: "진아" },
    };

    // Act
    const todo = toTodo(row);

    // Assert
    expect(todo).toEqual({
      id: "t1",
      content: "제주도 여행",
      sortOrder: 3,
      completedAt: undefined,
      authorNickname: "진아",
    });
  });

  it("작성자를 읽지 못하면 닉네임은 undefined다", () => {
    const todo = toTodo({ id: "t1", content: "a", sort_order: 1, completed_at: "2026-11-03T10:00:00+00:00", author: null });

    expect(todo.authorNickname).toBeUndefined();
    expect(todo.completedAt).toBe("2026-11-03T10:00:00+00:00");
  });
});

describe("groupTodos", () => {
  it("하지 않은 항목은 정한 순서대로, 완료한 항목은 최근에 완료한 것부터 따로 모은다", () => {
    // Arrange
    const todos = [
      createTodo({ id: "c", sortOrder: 3 }),
      createTodo({ id: "done-old", sortOrder: 1, completedAt: "2026-11-01T00:00:00Z" }),
      createTodo({ id: "a", sortOrder: 2 }),
      createTodo({ id: "done-new", sortOrder: 4, completedAt: "2026-11-02T00:00:00Z" }),
      createTodo({ id: "b", sortOrder: 2.5 }),
    ];

    // Act
    const { open, done } = groupTodos(todos);

    // Assert
    expect(toIds(open)).toEqual(["a", "b", "c"]);
    expect(toIds(done)).toEqual(["done-new", "done-old"]);
  });

  it("목록이 비어 있으면 둘 다 빈 배열이다", () => {
    expect(groupTodos([])).toEqual({ open: [], done: [] });
  });
});

describe("applyTodoAction", () => {
  const todos = [
    createTodo({ id: "a", sortOrder: 1 }),
    createTodo({ id: "b", sortOrder: 2, completedAt: "2026-11-01T00:00:00Z" }),
    createTodo({ id: "c", sortOrder: 3 }),
    createTodo({ id: "d", sortOrder: 4 }),
  ];

  it("위로 옮기면 완료한 항목을 건너뛰고 바로 위의 하지 않은 항목과 자리를 바꾼다", () => {
    const { open } = groupTodos(applyTodoAction(todos, { type: "move", id: "c", offset: -1 }));

    expect(toIds(open)).toEqual(["c", "a", "d"]);
  });

  it("아래로 옮기면 바로 아래 항목과 자리를 바꾼다", () => {
    const { open } = groupTodos(applyTodoAction(todos, { type: "move", id: "a", offset: 1 }));

    expect(toIds(open)).toEqual(["c", "a", "d"]);
  });

  it("맨 위를 위로, 맨 아래를 아래로 옮기면 그대로 둔다", () => {
    expect(applyTodoAction(todos, { type: "move", id: "a", offset: -1 })).toEqual(todos);
    expect(applyTodoAction(todos, { type: "move", id: "d", offset: 1 })).toEqual(todos);
  });

  it("완료한 항목은 옮기지 않는다", () => {
    expect(applyTodoAction(todos, { type: "move", id: "b", offset: -1 })).toEqual(todos);
  });

  it("완료로 표시하면 완료 목록 맨 위로 내려간다", () => {
    // Act
    const { open, done } = groupTodos(
      applyTodoAction(todos, { type: "complete", id: "a", completedAt: "2026-11-03T00:00:00Z" }),
    );

    // Assert
    expect(toIds(open)).toEqual(["c", "d"]);
    expect(toIds(done)).toEqual(["a", "b"]);
  });

  it("완료를 풀면 원래 순서 자리로 돌아온다", () => {
    const { open, done } = groupTodos(applyTodoAction(todos, { type: "complete", id: "b", completedAt: undefined }));

    expect(toIds(open)).toEqual(["a", "b", "c", "d"]);
    expect(done).toEqual([]);
  });

  it("없는 항목에 대한 동작은 목록을 바꾸지 않는다", () => {
    expect(applyTodoAction(todos, { type: "move", id: "zzz", offset: 1 })).toEqual(todos);
    expect(applyTodoAction(todos, { type: "complete", id: "zzz", completedAt: undefined })).toEqual(todos);
  });
});
