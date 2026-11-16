import { describe, expect, it, vi } from "vitest";
import { createPendingSaveStore, findSettledIds, isBeforeSave, type PendingSave } from "./pending-saves";

interface TestPending extends PendingSave {
  content: string;
}

const createPending = (overrides: Partial<TestPending> & Pick<TestPending, "id">): TestPending => ({
  content: `저장 중 ${overrides.id}`,
  revision: `새 판 ${overrides.id}`,
  previousRevisions: [],
  isNew: true,
  isSaved: false,
  ...overrides,
});

describe("isBeforeSave", () => {
  it("새 항목은 서버 목록에 들어왔으면 덮지 않는다", () => {
    expect(isBeforeSave("새 판 a", createPending({ id: "a" }))).toBe(false);
  });

  it("고치기는 저장이 끝나기 전이면 서버 판과 상관없이 덮는다", () => {
    expect(isBeforeSave("모르는 판", createPending({ id: "a", isNew: false }))).toBe(true);
  });

  it("고치기 저장이 끝난 뒤에는 서버 판이 저장 전 판일 때만 덮는다", () => {
    const pending = createPending({ id: "a", isNew: false, isSaved: true, previousRevisions: ["r1"] });

    expect(isBeforeSave("r1", pending)).toBe(true);
    expect(isBeforeSave("새 판 a", pending)).toBe(false);
  });

  it("서버 판을 모르면 저장이 끝난 뒤에는 따라잡은 것으로 본다", () => {
    expect(isBeforeSave(undefined, createPending({ id: "a", isNew: false, isSaved: true, previousRevisions: ["r1"] }))).toBe(false);
  });
});

describe("findSettledIds", () => {
  it("서버 목록에 들어온 새 항목, 따라잡은 고치기, 저장 뒤 사라진 고치기를 고르고 나머지는 남긴다", () => {
    // Arrange
    const pending = [
      createPending({ id: "new-in" }),
      createPending({ id: "new-out" }),
      createPending({ id: "edit-caught-up", isNew: false, isSaved: true, previousRevisions: ["r1"] }),
      createPending({ id: "edit-old", isNew: false, isSaved: true, previousRevisions: ["r1"] }),
      createPending({ id: "edit-saving", isNew: false }),
      createPending({ id: "edit-gone", isNew: false, isSaved: true }),
    ];
    const serverRevisions = new Map([
      ["new-in", "새 판 new-in"],
      ["edit-caught-up", "새 판 edit-caught-up"],
      ["edit-old", "r1"],
      ["edit-saving", "r1"],
    ]);

    // Act
    const settled = findSettledIds(serverRevisions, pending);

    // Assert
    expect(settled).toEqual(["new-in", "edit-caught-up", "edit-gone"]);
  });
});

describe("createPendingSaveStore", () => {
  it("더하고 저장 끝을 표시하고 빼면 그때마다 듣는 쪽에 알린다", () => {
    // Arrange
    const store = createPendingSaveStore<TestPending>();
    const listener = vi.fn();
    store.subscribe(listener);

    // Act
    store.add(createPending({ id: "a" }));
    store.markSaved("a", "새 판 a");
    const saved = store.getPending();
    store.remove(["a"]);

    // Assert
    expect(saved).toEqual([createPending({ id: "a", isSaved: true })]);
    expect(store.getPending()).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("바뀐 것이 없으면 알리지 않고 같은 목록을 돌려준다", () => {
    // Arrange: useSyncExternalStore는 같은 값을 돌려받아야 다시 그리지 않는다
    const store = createPendingSaveStore<TestPending>();
    store.add(createPending({ id: "a" }));
    const before = store.getPending();
    const listener = vi.fn();
    store.subscribe(listener);

    // Act
    store.remove(["없는 항목"]);
    store.markSaved("없는 항목", "판");
    store.discard("없는 항목", "판");
    store.removeSaved();

    // Assert
    expect(store.getPending()).toBe(before);
    expect(listener).not.toHaveBeenCalled();
  });

  it("같은 항목을 다시 고치면 대신하고, 앞선 저장의 판도 저장 전 판으로 친다", () => {
    // Arrange
    const store = createPendingSaveStore<TestPending>();
    store.add(createPending({ id: "a", content: "첫 고침", revision: "r2", previousRevisions: ["r1"], isNew: false }));

    // Act
    store.add(createPending({ id: "a", content: "두 번째 고침", revision: "r3", previousRevisions: ["r1"], isNew: false }));

    // Assert: 첫 고침이 저장된 목록(r2)이 와도 두 번째 고침을 계속 보여 준다
    const [pending] = store.getPending();
    expect(store.getPending()).toHaveLength(1);
    expect(pending?.content).toBe("두 번째 고침");
    expect(pending?.previousRevisions).toEqual(expect.arrayContaining(["r1", "r2"]));
  });

  it("목록을 떠날 때는 저장이 끝난 항목만 빼고 저장 중인 항목은 남긴다", () => {
    // Arrange
    const store = createPendingSaveStore<TestPending>();
    store.add(createPending({ id: "saved" }));
    store.add(createPending({ id: "saving" }));
    store.markSaved("saved", "새 판 saved");

    // Act
    store.removeSaved();

    // Assert
    expect(store.getPending().map(({ id }) => id)).toEqual(["saving"]);
  });

  it("같은 항목을 다시 저장하는 중이면 앞 저장의 끝·실패는 뒤 저장의 표시를 바꾸지 않는다", () => {
    // Arrange
    const store = createPendingSaveStore<TestPending>();
    store.add(createPending({ id: "a", revision: "r2", isNew: false }));
    store.add(createPending({ id: "a", revision: "r3", isNew: false }));

    // Act
    store.markSaved("a", "r2");
    store.discard("a", "r2");

    // Assert
    expect(store.getPending()).toMatchObject([{ id: "a", revision: "r3", isSaved: false }]);

    // Act: 뒤 저장이 실패하면 뺀다
    store.discard("a", "r3");

    // Assert
    expect(store.getPending()).toEqual([]);
  });
});
