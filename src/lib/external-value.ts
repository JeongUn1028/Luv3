/**
 * 화면끼리 나눠 보는 값 하나. React에서는 `useSyncExternalStore`로 읽는다.
 *
 * @example useSyncExternalStore(value.subscribe, value.get, () => initial)
 */
export interface ExternalValue<Value> {
  subscribe: (listener: () => void) => () => void;
  get: () => Value;
  /** 값을 바꾼다. 같은 값이면 알리지 않는다 */
  set: (value: Value) => void;
}

/**
 * 서로 부모·자식이 아닌 화면 조각(머리글 버튼과 내용 등)이 함께 보는 값을 만든다.
 *
 * @example
 * const isFailed = createExternalValue(false);
 * isFailed.set(true);
 */
export const createExternalValue = <Value>(initial: Value): ExternalValue<Value> => {
  let current = initial;
  const listeners = new Set<() => void>();

  return {
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    get: () => current,
    set: (value) => {
      if (Object.is(value, current)) return;
      current = value;
      listeners.forEach((listener) => listener());
    },
  };
};
