import { describe, expect, it, vi } from "vitest";
import type { Todo } from "./list";
import { createPendingTodoStore, findSettledPendingIds, mergePendingTodos, type PendingTodo } from "./pending";

const createTodo = (overrides: Partial<Todo> & Pick<Todo, "id">): Todo => ({
  content: `할 일 ${overrides.id}`,
  sortOrder: 1,
  completedAt: undefined,
  revision: `판 ${overrides.id}`,
  ...overrides,
});

const createPending = (overrides: Partial<PendingTodo> & Pick<PendingTodo, "id">): PendingTodo => ({
  content: `저장 중 ${overrides.id}`,
  revision: `새 판 ${overrides.id}`,
  previousRevisions: [],
  isNew: true,
  isSaved: false,
  ...overrides,
});

describe("mergePendingTodos", () => {
  it("저장 중인 새 항목은 서버 목록에 없으면 가장 큰 순서 값 다음으로 붙여 흐리게 보여 준다", () => {
    // Arrange
    const todos = [createTodo({ id: "a", sortOrder: 7 }), createTodo({ id: "done", sortOrder: 9, completedAt: "2026-11-01T00:00:00Z" })];
    const pending = [createPending({ id: "new-1", content: "벚꽃 보기" }), createPending({ id: "new-2", content: "한강 피크닉" })];

    // Act
    const shown = mergePendingTodos(todos, pending);

    // Assert
    expect(shown.map(({ id, content, sortOrder, isPending }) => ({ id, content, sortOrder, isPending }))).toEqual([
      { id: "a", content: "할 일 a", sortOrder: 7, isPending: undefined },
      { id: "done", content: "할 일 done", sortOrder: 9, isPending: undefined },
      { id: "new-1", content: "벚꽃 보기", sortOrder: 10, isPending: true },
      { id: "new-2", content: "한강 피크닉", sortOrder: 11, isPending: true },
    ]);
  });

  it("서버 목록이 비어 있어도 저장 중인 새 항목을 보여 준다", () => {
    const shown = mergePendingTodos([], [createPending({ id: "new-1" })]);

    expect(shown).toEqual([{ id: "new-1", content: "저장 중 new-1", sortOrder: 1, completedAt: undefined, revision: "새 판 new-1", isPending: true, isNew: true }]);
  });

  it("서버 목록에 새 항목의 id가 들어오면 서버 값을 그대로 보여 준다", () => {
    // Arrange
    const todos = [createTodo({ id: "new-1", content: "벚꽃 보기", sortOrder: 42 })];

    // Act
    const shown = mergePendingTodos(todos, [createPending({ id: "new-1", content: "벚꽃 보기" })]);

    // Assert
    expect(shown).toEqual(todos);
  });

  it("저장 중인 항목이 없으면 서버 목록을 새로 만들지 않고 그대로 돌려준다", () => {
    const todos = [createTodo({ id: "a" })];

    expect(mergePendingTodos(todos, [])).toBe(todos);
  });

  it("고치는 중인 항목은 서버 목록이 아직 저장 전 판이면 저장 중인 내용으로 덮어 보여 준다", () => {
    // Arrange
    const todos = [createTodo({ id: "a", content: "예전 내용", revision: "r1", sortOrder: 3 })];
    const pending = [createPending({ id: "a", content: "고친 내용", revision: "r2", previousRevisions: ["r1"], isNew: false })];

    // Act
    const shown = mergePendingTodos(todos, pending);

    // Assert
    expect(shown).toEqual([{ ...todos[0], content: "고친 내용", isPending: true }]);
  });

  it("저장이 끝난 뒤 고치는 중인 항목이 서버 목록에서 새 판이 되면 서버 값을 보여 준다", () => {
    // Arrange: 내 판이든 그 뒤 상대가 저장한 판이든 저장 전 판이 아니면 서버가 따라잡은 것이다
    const todos = [createTodo({ id: "a", content: "상대가 고친 내용", revision: "partner" })];
    const pending = [createPending({ id: "a", content: "고친 내용", revision: "r2", previousRevisions: ["r1"], isNew: false, isSaved: true })];

    // Act
    const shown = mergePendingTodos(todos, pending);

    // Assert
    expect(shown).toEqual(todos);
  });

  it("저장이 끝나기 전이면 숨겨 둔 목록이 폼이 읽은 판보다 오래돼도 저장 중인 내용을 보여 준다", () => {
    // Arrange: 목록은 r0을 들고 있는데 그사이 상대가 r1로 고쳤고, 폼은 r1을 읽어 저장했다
    const todos = [createTodo({ id: "a", content: "두 판 전 내용", revision: "r0" })];
    const pending = [createPending({ id: "a", content: "고친 내용", revision: "r2", previousRevisions: ["r1"], isNew: false })];

    // Act
    const shown = mergePendingTodos(todos, pending);

    // Assert
    expect(shown).toEqual([{ ...todos[0], content: "고친 내용", isPending: true }]);
  });

  it("고치는 중인 항목이 서버 목록에 없으면(상대가 지움) 붙이지 않는다", () => {
    const shown = mergePendingTodos([], [createPending({ id: "a", previousRevisions: ["r1"], isNew: false })]);

    expect(shown).toEqual([]);
  });
});

describe("findSettledPendingIds", () => {
  it("서버 목록이 따라잡거나 저장이 끝난 고치기가 지워졌으면 고르고, 저장이 끝나기 전 고치기는 고르지 않는다", () => {
    // Arrange
    const todos = [
      createTodo({ id: "arrived" }),
      createTodo({ id: "stale-edit", revision: "r1" }),
      createTodo({ id: "caught-up-edit", revision: "r2" }),
      createTodo({ id: "unsaved-edit", revision: "r0" }),
    ];
    const pending = [
      createPending({ id: "arrived" }),
      createPending({ id: "waiting" }),
      createPending({ id: "stale-edit", revision: "r2", previousRevisions: ["r1"], isNew: false, isSaved: true }),
      createPending({ id: "caught-up-edit", revision: "r2", previousRevisions: ["r1"], isNew: false, isSaved: true }),
      createPending({ id: "deleted-edit", previousRevisions: ["r1"], isNew: false, isSaved: true }),
      createPending({ id: "unsaved-edit", revision: "r2", previousRevisions: ["r1"], isNew: false }),
      createPending({ id: "unsaved-deleted-edit", previousRevisions: ["r1"], isNew: false }),
    ];

    // Act
    const settledIds = findSettledPendingIds(todos, pending);

    // Assert
    expect(settledIds).toEqual(["arrived", "caught-up-edit", "deleted-edit"]);
  });
});

describe("createPendingTodoStore", () => {
  it("더하고 저장 끝을 표시하고 빼면 그때마다 듣는 쪽에 알린다", () => {
    // Arrange
    const store = createPendingTodoStore();
    const listener = vi.fn();
    store.subscribe(listener);

    // Act
    store.add(createPending({ id: "a" }));
    store.markSaved("a");
    const saved = store.getPendingTodos();
    store.remove(["a"]);

    // Assert
    expect(saved).toEqual([createPending({ id: "a", isSaved: true })]);
    expect(store.getPendingTodos()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("바뀐 것이 없으면 알리지 않고 같은 목록을 돌려준다", () => {
    // Arrange: useSyncExternalStore는 같은 값을 돌려받아야 다시 그리지 않는다
    const store = createPendingTodoStore();
    store.add(createPending({ id: "a" }));
    const before = store.getPendingTodos();
    const listener = vi.fn();
    store.subscribe(listener);

    // Act
    store.remove(["없는 항목"]);
    store.markSaved("없는 항목");
    store.removeSaved();

    // Assert
    expect(store.getPendingTodos()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("같은 항목을 다시 고치면 대신하고, 앞선 저장의 판도 저장 전 판으로 친다", () => {
    // Arrange
    const store = createPendingTodoStore();
    store.add(createPending({ id: "a", content: "첫 고침", revision: "r2", previousRevisions: ["r1"], isNew: false }));

    // Act
    store.add(createPending({ id: "a", content: "두 번째 고침", revision: "r3", previousRevisions: ["r1"], isNew: false }));

    // Assert: 첫 고침이 저장된 목록(r2)이 와도 두 번째 고침을 계속 보여 준다
    const [pending] = store.getPendingTodos();
    expect(store.getPendingTodos()).toHaveLength(1);
    expect(pending?.content).toBe("두 번째 고침");
    expect(pending?.previousRevisions).toEqual(expect.arrayContaining(["r1", "r2"]));
  });

  it("목록을 떠날 때는 저장이 끝난 항목만 빼고 저장 중인 항목은 남긴다", () => {
    // Arrange
    const store = createPendingTodoStore();
    store.add(createPending({ id: "saved" }));
    store.add(createPending({ id: "saving" }));
    store.markSaved("saved");

    // Act
    store.removeSaved();

    // Assert
    expect(store.getPendingTodos().map(({ id }) => id)).toEqual(["saving"]);
  });
});
