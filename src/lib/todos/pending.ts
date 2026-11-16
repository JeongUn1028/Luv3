import { createPendingSaveStore, findSettledIds, isBeforeSave, type PendingSave } from "@/lib/pending-saves";
import type { Todo } from "./list";

/**
 * 저장을 기다리는 하고 싶은 것(#345). 저장을 누르자마자 목록으로 돌아가므로, 서버 목록이 따라잡을 때까지 목록에 먼저 보여 준다.
 * 새 항목은 서버 목록에 들어올 때까지 목록 끝에 붙여 보여 준다.
 *
 * @example const pending: PendingTodo = { id, content: "벚꽃 보기", revision, previousRevisions: [], isNew: true, isSaved: false };
 */
export interface PendingTodo extends PendingSave {
  /** 저장하는 내용. 앞뒤 공백은 이미 뺀 값이다 */
  content: string;
}

/**
 * 목록에 그리는 항목. 저장 중이면 흐리게 그리고 누를 수 없게 한다. 저장 중인 항목이 없으면 서버 목록의 항목을 그대로 쓴다.
 *
 * @example const shown: ShownTodo = { ...todo, isPending: true, isNew: true };
 */
export interface ShownTodo extends Todo {
  /** 폼에서 저장 중인지 */
  isPending?: boolean;
  /** 아직 서버에 없는 새 항목인지. 순서를 바꿀 때 이웃으로 치지 않는다 */
  isNew?: boolean;
}

/**
 * 서버 목록에 저장 중인 항목을 합친다.
 * - 고치는 중인 항목은 서버 목록이 아직 저장 전 판이면 저장 중인 내용으로 보여 준다
 * - 새 항목은 서버 목록에 그 id가 없으면 하지 않은 항목 맨 아래에 붙인다(DB도 새 항목에 가장 큰 순서 값을 준다)
 * - 서버 목록이 따라잡았으면(새 판이거나 id가 들어옴) 서버 목록 그대로 보여 준다. 같은 id라 자리를 옮기지 않는다
 *
 * @example const shown = mergePendingTodos(todos, pendingTodoStore.getPending());
 */
export const mergePendingTodos = (todos: Todo[], pendingTodos: readonly PendingTodo[]): ShownTodo[] => {
  // 목록이 1000개를 넘을 수 있어(#272), 저장 중인 항목이 없으면 새로 만들지 않는다
  if (pendingTodos.length === 0) return todos;
  const pendingById = new Map(pendingTodos.map((pending) => [pending.id, pending]));
  const shown: ShownTodo[] = todos.map((todo) => {
    const pending = pendingById.get(todo.id);
    return pending && isBeforeSave(todo.revision, pending) ? { ...todo, content: pending.content, isPending: true } : todo;
  });

  const savedIds = new Set(todos.map(({ id }) => id));
  let nextSortOrder = todos.reduce((largest, { sortOrder }) => Math.max(largest, sortOrder), 0) + 1;
  for (const pending of pendingTodos) {
    if (!pending.isNew || savedIds.has(pending.id)) continue;
    shown.push({ id: pending.id, content: pending.content, sortOrder: nextSortOrder, completedAt: undefined, revision: pending.revision, isPending: true, isNew: true });
    nextSortOrder += 1;
  }
  return shown;
};

/**
 * 서버 목록이 따라잡아 더는 먼저 보여 줄 필요가 없는 저장 중인 항목의 id. 고치던 항목이 목록에서 사라졌으면(상대가 지움) 그것도 뺀다.
 *
 * @example pendingTodoStore.remove(findSettledPendingIds(todos, pendingTodos));
 */
export const findSettledPendingIds = (todos: Todo[], pendingTodos: readonly PendingTodo[]): string[] =>
  findSettledIds(new Map(todos.map(({ id, revision }) => [id, revision])), pendingTodos);

/** 앱 전체에서 하나만 쓰는 저장 중인 하고 싶은 것 보관함 */
export const pendingTodoStore = createPendingSaveStore<PendingTodo>();
