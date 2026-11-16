/**
 * 저장을 기다리는 항목의 공통 칸(#345). 저장을 누르자마자 목록·캘린더로 돌아가므로, 서버 목록이 따라잡을 때까지 먼저 보여 준다.
 *
 * @example const pending: PendingSave = { id, revision, previousRevisions: [], isNew: true, isSaved: false };
 */
export interface PendingSave {
  id: string;
  /** 이번 저장으로 바뀔 판 번호 */
  revision: string;
  /** 저장하기 전의 판 번호들. 서버 목록의 판이 이 중 하나면 아직 저장 전에 받은 목록이다. 새 항목은 비어 있다 */
  previousRevisions: string[];
  /** 새 항목인지. 새 항목은 서버 목록에 그 id가 들어오면 저장된 것이다 */
  isNew: boolean;
  /** 저장이 끝났는지. 끝나기 전에는 서버 목록이 어떤 판이든 저장 중인 내용을 보여 준다. 끝났는데도 서버 목록에 없으면(그사이 상대가 지움) 화면을 떠날 때 뺀다 */
  isSaved: boolean;
}

/**
 * 서버 목록의 항목(판 번호 `serverRevision`)을 저장 중인 내용으로 덮어 보여 줘야 하는지. 새 항목은 서버 목록에 들어왔으면 이미 저장된 것이다.
 * 고치기는 저장이 끝나기 전이면 숨겨 둔 목록이 폼이 읽은 판보다 오래됐을 수 있어(판 번호로는 앞뒤를 알 수 없다) 늘 덮는다.
 *
 * @example isBeforeSave(todo.revision, pending) // true면 저장 중인 내용으로 덮는다
 */
export const isBeforeSave = (serverRevision: string | undefined, pending: PendingSave): boolean =>
  !pending.isNew && (!pending.isSaved || (serverRevision !== undefined && pending.previousRevisions.includes(serverRevision)));

/**
 * 서버 목록이 따라잡아 더는 먼저 보여 줄 필요가 없는 저장 중인 항목의 id. 고치던 항목이 목록에서 사라졌으면(상대가 지움) 그것도 뺀다.
 * 고치기는 저장이 끝난 뒤에만 고른다. 끝나기 전에 받은 목록은 폼이 읽은 판보다 오래됐을 수 있다.
 *
 * @example store.remove(findSettledIds(new Map(todos.map((todo) => [todo.id, todo.revision])), store.getPending()));
 */
export const findSettledIds = (serverRevisions: ReadonlyMap<string, string | undefined>, pendingSaves: readonly PendingSave[]): string[] =>
  pendingSaves
    .filter((pending) => {
      if (serverRevisions.has(pending.id)) return !isBeforeSave(serverRevisions.get(pending.id), pending);
      return !pending.isNew && pending.isSaved;
    })
    .map(({ id }) => id);

/**
 * 저장 중인 항목 보관함. React에서는 `useSyncExternalStore`로 읽는다.
 *
 * @example useSyncExternalStore(store.subscribe, store.getPending, () => [])
 */
export interface PendingSaveStore<Pending extends PendingSave> {
  subscribe: (listener: () => void) => () => void;
  getPending: () => readonly Pending[];
  /** 저장을 시작할 때 더한다. 같은 항목을 또 고치면 대신하되, 앞선 저장의 판도 저장 전 판으로 친다 */
  add: (pending: Omit<Pending, "isSaved">) => void;
  /**
   * 그 판의 저장이 끝나면 표시한다. 서버 목록이 따라잡을 때까지 계속 보여 준다.
   * 그사이 같은 항목을 다시 저장해 판이 바뀌었으면 뒤 저장이 아직 진행 중이라 그대로 둔다
   */
  markSaved: (id: string, revision: string) => void;
  /** 그 판의 저장에 실패하면 뺀다. 그사이 같은 항목을 다시 저장해 판이 바뀌었으면 뒤 저장의 것이라 그대로 둔다 */
  discard: (id: string, revision: string) => void;
  /** 서버 목록이 따라잡은 항목을 뺀다 */
  remove: (ids: readonly string[]) => void;
  /** 저장은 끝났는데 서버 목록에 들어오지 않은 항목을 뺀다. 화면을 떠날 때 부른다 */
  removeSaved: () => void;
}

/**
 * 저장 중인 항목 보관함을 만든다. 폼과 목록이 서로 다른 화면이라 둘 바깥에 둔다.
 *
 * @example
 * const store = createPendingSaveStore<PendingTodo>();
 * store.add({ id, content: "벚꽃 보기", revision, previousRevisions: [], isNew: true });
 */
export const createPendingSaveStore = <Pending extends PendingSave>(): PendingSaveStore<Pending> => {
  let pendingSaves: readonly Pending[] = [];
  const listeners = new Set<() => void>();

  const update = (next: readonly Pending[]) => {
    if (next.length === pendingSaves.length && next.every((pending, index) => pending === pendingSaves[index])) return;
    pendingSaves = next;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getPending: () => pendingSaves,
    add: (pending) => {
      const earlier = pendingSaves.find(({ id }) => id === pending.id);
      const previousRevisions = earlier ? [...pending.previousRevisions, earlier.revision, ...earlier.previousRevisions] : pending.previousRevisions;
      // Omit<Pending, "isSaved">에 isSaved를 더하면 Pending이지만 TypeScript는 제네릭이라 알아보지 못한다
      const added = { ...pending, previousRevisions, isSaved: false } as Pending;
      update([...pendingSaves.filter(({ id }) => id !== pending.id), added]);
    },
    markSaved: (id, revision) =>
      update(pendingSaves.map((pending) => (pending.id === id && pending.revision === revision && !pending.isSaved ? { ...pending, isSaved: true } : pending))),
    discard: (id, revision) => update(pendingSaves.filter((pending) => !(pending.id === id && pending.revision === revision))),
    remove: (ids) => update(pendingSaves.filter(({ id }) => !ids.includes(id))),
    removeSaved: () => update(pendingSaves.filter(({ isSaved }) => !isSaved)),
  };
};
