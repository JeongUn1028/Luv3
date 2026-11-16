import { useSyncExternalStore } from "react";

/**
 * 지우는 중인 항목 보관함(#346). 지우기를 확인하면 응답을 기다리지 않고 돌아가므로, 돌아간 목록·캘린더가 그 항목을 바로 숨긴다.
 * 지운 항목은 서버 목록에 다시 나오지 않으므로 지우기가 끝나도 빼지 않는다. 지우지 못했을 때만 되돌린다.
 * React에서는 `useDeletingKeys`로 읽는다.
 *
 * @example const deletingKeys = useDeletingKeys();
 */
export interface DeletingStore {
  subscribe: (listener: () => void) => () => void;
  /** 숨길 항목의 key(`DELETING_KEYS`로 만든다). 바뀔 때만 새 값을 돌려준다 */
  getKeys: () => ReadonlySet<string>;
  hide: (key: string) => void;
  /** 지우지 못했으면 다시 보여 준다 */
  restore: (key: string) => void;
  /** 이 글자로 시작하는 key를 모두 다시 보여 준다. 반복 일정을 다시 저장해 지운 날이 돌아올 수 있을 때 쓴다 */
  restoreStartingWith: (prefix: string) => void;
}

/**
 * 지우는 중인 항목 보관함을 만든다. 폼과 목록이 서로 다른 화면이라 둘 바깥에 둔다.
 *
 * @example const store = createDeletingStore(); store.hide(DELETING_KEYS.todo(id));
 */
export const createDeletingStore = (): DeletingStore => {
  let keys: ReadonlySet<string> = new Set();
  const listeners = new Set<() => void>();

  const update = (next: ReadonlySet<string>) => {
    keys = next;
    listeners.forEach((listener) => listener());
  };

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getKeys: () => keys,
    hide: (key) => {
      if (!keys.has(key)) update(new Set([...keys, key]));
    },
    restore: (key) => {
      if (keys.has(key)) update(new Set([...keys].filter((kept) => kept !== key)));
    },
    restoreStartingWith: (prefix) => {
      const kept = [...keys].filter((key) => !key.startsWith(prefix));
      if (kept.length !== keys.size) update(new Set(kept));
    },
  };
};

/**
 * 반복 일정에서 하루씩 지운 날들의 key 앞부분. 일정을 다시 저장하면 반복이 바뀌어 지운 날이 돌아올 수 있어 이것으로 한꺼번에 푼다.
 *
 * @example deletingStore.restoreStartingWith(toEventDayPrefix(eventId))
 */
export const toEventDayPrefix = (id: string): string => `event:${id}@`;

/**
 * 지우는 항목의 key. 종류가 달라도 id가 겹치지 않게 앞에 종류를 붙인다.
 * 반복 일정의 하루만 지우면 그날 key(`date`)를, 일정 전체를 지우면 일정 key를 쓴다.
 *
 * @example DELETING_KEYS.event(eventId, "2026-11-20") // 그날만
 */
export const DELETING_KEYS = {
  todo: (id: string): string => `todo:${id}`,
  record: (id: string): string => `record:${id}`,
  event: (id: string, date?: string): string => (date ? `${toEventDayPrefix(id)}${date}` : `event:${id}`),
} as const;

/**
 * 지우는 중인 항목을 뺀 목록. 뺄 것이 없으면 받은 목록을 그대로 돌려줘 다시 그리지 않게 한다.
 *
 * @example const shown = omitDeleting(todos, deletingKeys, DELETING_KEYS.todo);
 */
export const omitDeleting = <Item extends { id: string }>(items: Item[], keys: ReadonlySet<string>, toKey: (id: string) => string): Item[] => {
  if (keys.size === 0) return items;
  const kept = items.filter(({ id }) => !keys.has(toKey(id)));
  return kept.length === items.length ? items : kept;
};

/**
 * 캘린더의 일정 한 줄이 지우는 중인지. 일정 전체를 지우면 모든 날이, 하루만 지우면 그날만 해당한다.
 *
 * @example isDeletingEvent(deletingKeys, event) // true면 그리지 않는다
 */
export const isDeletingEvent = (keys: ReadonlySet<string>, { id, date }: { id: string; date: string }): boolean =>
  keys.has(DELETING_KEYS.event(id)) || keys.has(DELETING_KEYS.event(id, date));

/** 앱 전체에서 하나만 쓰는 지우는 중인 항목 보관함 */
export const deletingStore = createDeletingStore();

// 서버에서 그릴 때는 지우는 중인 항목이 없다. 같은 값을 돌려줘야 다시 그리지 않는다
const NO_DELETING: ReadonlySet<string> = new Set();

/**
 * 지우는 중인 항목의 key를 읽는다. 바뀌면 다시 그린다.
 *
 * @example const deletingKeys = useDeletingKeys(); const shown = omitDeleting(todos, deletingKeys, DELETING_KEYS.todo);
 */
export const useDeletingKeys = (): ReadonlySet<string> => useSyncExternalStore(deletingStore.subscribe, deletingStore.getKeys, () => NO_DELETING);
