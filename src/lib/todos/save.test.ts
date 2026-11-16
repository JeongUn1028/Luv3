import { describe, expect, it } from "vitest";
import { createFakeRevisionedTable } from "@/test-utils/revisioned-table";
import { saveTodo } from "./save";

const TODO_ID = "10000000-0000-4000-8000-000000000001";
const NEW_TODO_ID = "10000000-0000-4000-8000-000000000002";
const NO_UPDATED_ROWS = [{ data: [], error: null }];

const createTodos = createFakeRevisionedTable<{ content: string }>;

describe("saveTodo", () => {
  it("새 항목은 내용과 새 id·이번 판 번호로 만들고, 성공하면 실패 내용이 없다", async () => {
    // Arrange
    const { table, calls } = createTodos();

    // Act
    const failure = await saveTodo({ todos: table, content: "벚꽃 보기", todoId: undefined, newTodoId: NEW_TODO_ID, expectedRevisions: [], revision: "r2" });

    // Assert
    expect(failure).toBeUndefined();
    expect(calls.insert).toEqual([{ content: "벚꽃 보기", revision: "r2", id: NEW_TODO_ID }]);
  });

  it("고칠 항목은 불러온 판과 이번 판일 때만 고친다", async () => {
    // Arrange
    const { table, calls } = createTodos();

    // Act
    await saveTodo({ todos: table, content: "벚꽃 보기", todoId: TODO_ID, newTodoId: NEW_TODO_ID, expectedRevisions: ["r1"], revision: "r2" });

    // Assert
    expect(calls.update).toEqual([{ values: { content: "벚꽃 보기", revision: "r2" }, id: TODO_ID, revisions: ["r1", "r2"] }]);
  });

  it("고치는 사이 상대가 고쳤으면 최신 내용을 불러오라고 알린다", async () => {
    const { table } = createTodos({ updateResults: NO_UPDATED_ROWS });

    const failure = await saveTodo({ todos: table, content: "벚꽃 보기", todoId: TODO_ID, newTodoId: NEW_TODO_ID, expectedRevisions: ["r1"], revision: "r2" });

    expect(failure).toMatchObject({ hasConflict: true, message: "그사이 이 항목이 바뀌어 저장하지 않았어요. 최신 내용을 불러와 다시 고쳐 주세요. 지금 쓴 내용은 사라져요." });
  });

  it("고칠 항목이 그사이 지워졌으면 목록에서 확인하라고 알린다", async () => {
    const { table } = createTodos({ updateResults: NO_UPDATED_ROWS, isRowThere: false });

    const failure = await saveTodo({ todos: table, content: "벚꽃 보기", todoId: TODO_ID, newTodoId: NEW_TODO_ID, expectedRevisions: ["r1"], revision: "r2" });

    expect(failure).toMatchObject({ isGone: true, message: "이 항목은 이미 지워졌어요. 목록에서 다시 확인해 주세요." });
  });

  it("거절이 분명한 오류면 잠시 후 다시 시도하라고 알린다", async () => {
    const { table } = createTodos({ updateResults: [{ data: null, error: { code: "42501" } }] });

    const failure = await saveTodo({ todos: table, content: "벚꽃 보기", todoId: TODO_ID, newTodoId: NEW_TODO_ID, expectedRevisions: ["r1"], revision: "r2" });

    expect(failure).toMatchObject({ mayHaveSaved: false, message: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." });
  });
});
