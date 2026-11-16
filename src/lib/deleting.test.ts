import { describe, expect, it, vi } from "vitest";
import { createDeletingStore, DELETING_KEYS, isDeletingEvent, omitDeleting, toEventDayPrefix } from "./deleting";

describe("createDeletingStore", () => {
  it("숨기면 그 key가 들어가고 알리며, 되돌리면 빠진다", () => {
    // Arrange
    const store = createDeletingStore();
    const listener = vi.fn();
    store.subscribe(listener);

    // Act
    store.hide("todo:a");

    // Assert
    expect(store.getKeys().has("todo:a")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);

    // Act
    store.restore("todo:a");

    // Assert
    expect(store.getKeys().has("todo:a")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("바뀐 것이 없으면 같은 값을 돌려주고 알리지 않는다", () => {
    // Arrange
    const store = createDeletingStore();
    store.hide("todo:a");
    const keys = store.getKeys();
    const listener = vi.fn();
    store.subscribe(listener);

    // Act
    store.hide("todo:a");
    store.restore("todo:b");

    // Assert
    expect(store.getKeys()).toBe(keys);
    expect(listener).not.toHaveBeenCalled();
  });

  it("앞부분이 같은 key를 한꺼번에 되돌린다", () => {
    // Arrange
    const store = createDeletingStore();
    store.hide(DELETING_KEYS.event("a", "2026-11-20"));
    store.hide(DELETING_KEYS.event("a", "2026-11-27"));
    store.hide(DELETING_KEYS.event("a"));
    store.hide(DELETING_KEYS.event("b", "2026-11-20"));

    // Act
    store.restoreStartingWith(toEventDayPrefix("a"));

    // Assert
    expect([...store.getKeys()]).toEqual([DELETING_KEYS.event("a"), DELETING_KEYS.event("b", "2026-11-20")]);
  });

  it("구독을 풀면 더는 알리지 않는다", () => {
    // Arrange
    const store = createDeletingStore();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    // Act
    unsubscribe();
    store.hide("todo:a");

    // Assert
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("omitDeleting", () => {
  it("지우는 중인 항목만 빼고, 없으면 받은 목록을 그대로 돌려준다", () => {
    // Arrange
    const items = [{ id: "a" }, { id: "b" }];

    // Act & Assert
    expect(omitDeleting(items, new Set([DELETING_KEYS.todo("a")]), DELETING_KEYS.todo)).toEqual([{ id: "b" }]);
    expect(omitDeleting(items, new Set(), DELETING_KEYS.todo)).toBe(items);
  });

  it("다른 종류의 같은 id는 빼지 않는다", () => {
    expect(omitDeleting([{ id: "a" }], new Set([DELETING_KEYS.record("a")]), DELETING_KEYS.todo)).toEqual([{ id: "a" }]);
  });
});

describe("isDeletingEvent", () => {
  it("일정 전체를 지우면 모든 날을, 하루만 지우면 그날만 숨긴다", () => {
    // Arrange
    const keys = new Set([DELETING_KEYS.event("all"), DELETING_KEYS.event("repeat", "2026-11-20")]);

    // Act & Assert
    expect(isDeletingEvent(keys, { id: "all", date: "2026-11-13" })).toBe(true);
    expect(isDeletingEvent(keys, { id: "repeat", date: "2026-11-20" })).toBe(true);
    expect(isDeletingEvent(keys, { id: "repeat", date: "2026-11-27" })).toBe(false);
    expect(isDeletingEvent(keys, { id: "other", date: "2026-11-20" })).toBe(false);
  });
});
