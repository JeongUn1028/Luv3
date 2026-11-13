import type { Todo } from "./list";

/**
 * 저장을 기다리는 하고 싶은 것(#345). 저장을 누르자마자 목록으로 돌아가므로, 서버 목록이 따라잡을 때까지 목록에 먼저 보여 준다.
 *
 * @example const pending: PendingTodo = { id, content: "벚꽃 보기", revision, previousRevisions: [], isNew: true, isSaved: false };
 */
export interface PendingTodo {
  id: string;
  /** 저장하는 내용. 앞뒤 공백은 이미 뺀 값이다 */
  content: string;
  /** 이번 저장으로 바뀔 판 번호 */
  revision: string;
  /** 저장하기 전의 판 번호들. 서버 목록의 판이 이 중 하나면 아직 저장 전에 받은 목록이다. 새 항목은 비어 있다 */
  previousRevisions: string[];
  /** 새 항목인지. 새 항목은 서버 목록에 들어올 때까지 목록 끝에 붙여 보여 준다 */
  isNew: boolean;
  /** 저장이 끝났는지. 끝나기 전에는 서버 목록이 어떤 판이든 저장 중인 내용을 보여 준다. 끝났는데도 서버 목록에 없으면(그사이 상대가 지움) 목록을 떠날 때 뺀다 */
  isSaved: boolean;
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
 * 서버 목록의 이 항목을 저장 중인 내용으로 덮어 보여 줘야 하는지. 새 항목은 서버 목록에 들어왔으면 이미 저장된 것이다.
 * 고치기는 저장이 끝나기 전이면 숨겨 둔 목록이 폼이 읽은 판보다 오래됐을 수 있어(판 번호로는 앞뒤를 알 수 없다) 늘 덮는다
 */
const isBeforeSave = (todo: Todo, pending: PendingTodo): boolean =>
  !pending.isNew && (!pending.isSaved || pending.previousRevisions.includes(todo.revision));

/**
 * 서버 목록에 저장 중인 항목을 합친다.
 * - 고치는 중인 항목은 서버 목록이 아직 저장 전 판이면 저장 중인 내용으로 보여 준다
 * - 새 항목은 서버 목록에 그 id가 없으면 하지 않은 항목 맨 아래에 붙인다(DB도 새 항목에 가장 큰 순서 값을 준다)
 * - 서버 목록이 따라잡았으면(새 판이거나 id가 들어옴) 서버 목록 그대로 보여 준다. 같은 id라 자리를 옮기지 않는다
 *
 * @example const shown = mergePendingTodos(todos, pendingTodoStore.getPendingTodos());
 */
export const mergePendingTodos = (todos: Todo[], pendingTodos: readonly PendingTodo[]): ShownTodo[] => {
  // 목록이 1000개를 넘을 수 있어(#272), 저장 중인 항목이 없으면 새로 만들지 않는다
  if (pendingTodos.length === 0) return todos;
  const pendingById = new Map(pendingTodos.map((pending) => [pending.id, pending]));
  const shown: ShownTodo[] = todos.map((todo) => {
    const pending = pendingById.get(todo.id);
    return pending && isBeforeSave(todo, pending) ? { ...todo, content: pending.content, isPending: true } : todo;
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
 * 고치기는 저장이 끝난 뒤에만 고른다. 끝나기 전에 받은 목록은 폼이 읽은 판보다 오래됐을 수 있다.
 *
 * @example pendingTodoStore.remove(findSettledPendingIds(todos, pendingTodos));
 */
export const findSettledPendingIds = (todos: Todo[], pendingTodos: readonly PendingTodo[]): string[] => {
  const todoById = new Map(todos.map((todo) => [todo.id, todo]));
  return pendingTodos
    .filter((pending) => {
      const todo = todoById.get(pending.id);
      if (todo) return !isBeforeSave(todo, pending);
      return !pending.isNew && pending.isSaved;
    })
    .map(({ id }) => id);
};

/**
 * 저장 중인 하고 싶은 것 보관함. React에서는 `useSyncExternalStore`로 읽는다.
 *
 * @example useSyncExternalStore(pendingTodoStore.subscribe, pendingTodoStore.getPendingTodos, () => [])
 */
export interface PendingTodoStore {
  subscribe: (listener: () => void) => () => void;
  getPendingTodos: () => readonly PendingTodo[];
  /** 저장을 시작할 때 더한다. 같은 항목을 또 고치면 대신하되, 앞선 저장의 판도 저장 전 판으로 친다 */
  add: (pending: Omit<PendingTodo, "isSaved">) => void;
  /** 저장이 끝나면 표시한다. 서버 목록이 따라잡을 때까지 계속 보여 준다 */
  markSaved: (id: string) => void;
  /** 저장에 실패했거나 서버 목록이 따라잡은 항목을 뺀다 */
  remove: (ids: readonly string[]) => void;
  /** 저장은 끝났는데 서버 목록에 들어오지 않은 항목을 뺀다. 목록을 떠날 때 부른다 */
  removeSaved: () => void;
}

/**
 * 저장 중인 하고 싶은 것 보관함을 만든다. 폼과 목록이 서로 다른 화면이라 둘 바깥에 둔다.
 *
 * @example
 * const store = createPendingTodoStore();
 * store.add({ id, content: "벚꽃 보기", revision, previousRevisions: [], isNew: true });
 */
export const createPendingTodoStore = (): PendingTodoStore => {
  let pendingTodos: readonly PendingTodo[] = [];
  const listeners = new Set<() => void>();

  const update = (next: readonly PendingTodo[]) => {
    if (next.length === pendingTodos.length && next.every((pending, index) => pending === pendingTodos[index])) return;
    pendingTodos = next;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPendingTodos: () => pendingTodos,
    add: (pending) => {
      const earlier = pendingTodos.find(({ id }) => id === pending.id);
      const previousRevisions = earlier ? [...pending.previousRevisions, earlier.revision, ...earlier.previousRevisions] : pending.previousRevisions;
      update([...pendingTodos.filter(({ id }) => id !== pending.id), { ...pending, previousRevisions, isSaved: false }]);
    },
    markSaved: (id) => update(pendingTodos.map((pending) => (pending.id === id && !pending.isSaved ? { ...pending, isSaved: true } : pending))),
    remove: (ids) => update(pendingTodos.filter(({ id }) => !ids.includes(id))),
    removeSaved: () => update(pendingTodos.filter(({ isSaved }) => !isSaved)),
  };
};

/** 앱 전체에서 하나만 쓰는 저장 중인 하고 싶은 것 보관함 */
export const pendingTodoStore = createPendingTodoStore();
