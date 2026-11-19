import { describe, expect, it, vi } from "vitest";
import { saveTodoAction, TODO_ACTION_FAILED_MESSAGE, TODO_ALREADY_DELETED_MESSAGE, type CompletableTodos } from "./actions";

const TODO_ID = "10000000-0000-4000-8000-000000000001";

interface FakeParams {
  moveError?: { code?: string } | null;
  updatedRows?: { id: string }[];
  updateError?: { code?: string } | null;
}

/** 부른 값을 기록하고 정해 둔 결과를 돌려주는 가짜 표와 move_todo */
const createFakes = ({ moveError = null, updatedRows = [{ id: TODO_ID }], updateError = null }: FakeParams = {}) => {
  const updates: { values: unknown; id: string; columns: string }[] = [];
  const todos: CompletableTodos = {
    update: (values) => ({
      eq: (_column, id) => ({
        select: async (columns) => {
          updates.push({ values, id, columns });
          return { data: updateError ? null : updatedRows, error: updateError };
        },
      }),
    }),
  };
  const moveTodo = vi.fn(async () => ({ error: moveError }));
  return { todos, moveTodo, updates };
};

describe("saveTodoAction", () => {
  it("순서를 바꾸면 항목과 옮길 칸 수로 move_todo를 부르고, 성공하면 문구가 없다", async () => {
    // Arrange
    const { todos, moveTodo } = createFakes();

    // Act
    const message = await saveTodoAction({ action: { type: "move", id: TODO_ID, offset: -1 }, todos, moveTodo });

    // Assert
    expect(moveTodo).toHaveBeenCalledWith({ p_id: TODO_ID, p_offset: -1 });
    expect(message).toBeUndefined();
  });

  it("상대가 지웠거나 완료한 항목을 옮기면(P0002) 이미 지워졌다고 알린다", async () => {
    const { todos, moveTodo } = createFakes({ moveError: { code: "P0002" } });

    expect(await saveTodoAction({ action: { type: "move", id: TODO_ID, offset: 1 }, todos, moveTodo })).toBe(TODO_ALREADY_DELETED_MESSAGE);
  });

  it("그 밖의 이유로 옮기지 못하면 다시 시도하라고 알린다", async () => {
    const { todos, moveTodo } = createFakes({ moveError: { code: "57014" } });

    expect(await saveTodoAction({ action: { type: "move", id: TODO_ID, offset: 1 }, todos, moveTodo })).toBe(TODO_ACTION_FAILED_MESSAGE);
  });

  it("완료하면 완료 시각을, 완료를 풀면 null을 저장하고 바뀐 행을 받아 온다", async () => {
    // Arrange
    const { todos, moveTodo, updates } = createFakes();

    // Act
    await saveTodoAction({ action: { type: "complete", id: TODO_ID, completedAt: "2026-11-16T03:00:00.000Z" }, todos, moveTodo });
    await saveTodoAction({ action: { type: "complete", id: TODO_ID, completedAt: undefined }, todos, moveTodo });

    // Assert
    expect(updates).toEqual([
      { values: { completed_at: "2026-11-16T03:00:00.000Z" }, id: TODO_ID, columns: "id" },
      { values: { completed_at: null }, id: TODO_ID, columns: "id" },
    ]);
  });

  it("상대가 지운 항목은 오류 없이 0행이 바뀌므로 이미 지워졌다고 알린다", async () => {
    const { todos, moveTodo } = createFakes({ updatedRows: [] });

    expect(await saveTodoAction({ action: { type: "complete", id: TODO_ID, completedAt: undefined }, todos, moveTodo })).toBe(TODO_ALREADY_DELETED_MESSAGE);
  });

  it("완료를 저장하지 못하면 다시 시도하라고 알린다", async () => {
    const { todos, moveTodo } = createFakes({ updateError: { code: "42501" } });

    expect(await saveTodoAction({ action: { type: "complete", id: TODO_ID, completedAt: undefined }, todos, moveTodo })).toBe(TODO_ACTION_FAILED_MESSAGE);
  });

  it("[아직]을 누르면 그 일정 날짜를 저장하고, 상대가 지운 항목이면 이미 지워졌다고 알린다(#471)", async () => {
    // Arrange
    const saved = createFakes();
    const deleted = createFakes({ updatedRows: [] });
    const action = { type: "notYet", id: TODO_ID, date: "2026-11-23" } as const;

    // Act
    const message = await saveTodoAction({ action, todos: saved.todos, moveTodo: saved.moveTodo });

    // Assert
    expect(message).toBeUndefined();
    expect(saved.updates).toEqual([{ values: { event_not_yet_date: "2026-11-23" }, id: TODO_ID, columns: "id" }]);
    expect(await saveTodoAction({ action, todos: deleted.todos, moveTodo: deleted.moveTodo })).toBe(TODO_ALREADY_DELETED_MESSAGE);
  });
});
