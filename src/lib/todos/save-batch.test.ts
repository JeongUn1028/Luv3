import { describe, expect, it, vi } from "vitest";
import { TODO_ACTION_FAILED_MESSAGE, TODO_ALREADY_DELETED_MESSAGE } from "./actions";
import { createTodoSaveBatch } from "./save-batch";

/** 부를 때까지 끝나지 않는 일. `finish`로 끝낸다 */
const createHeld = <Result>() => {
  let resolveHeld: ((result: Result) => void) | undefined;
  const start = () =>
    new Promise<Result>((resolve) => {
      resolveHeld = resolve;
    });
  return { start, finish: (result: Result) => resolveHeld?.(result) };
};

/** 대기 중인 then 콜백이 모두 돌게 한다 */
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

/** 기다리지 않는 묶음. 묶음의 경계는 저장이 겹치는지로만 정해진다 */
const createInstantBatch = () => createTodoSaveBatch({ wait: async () => undefined });

describe("createTodoSaveBatch", () => {
  it("저장이 끝나면 결과를 바로 넘기고, 묶음이 끝나면 새로 고치게 한다", async () => {
    // Arrange
    const batch = createInstantBatch();
    const onSaved = vi.fn();

    // Act
    const shouldRefresh = await batch.run(async () => undefined, onSaved);

    // Assert
    expect(onSaved).toHaveBeenCalledWith(undefined);
    expect(shouldRefresh).toBe(true);
  });

  it("연달아 저장하면 앞 저장이 끝난 뒤에 다음 저장을 시작하고, 마지막 저장이 끝났을 때만 새로 고치게 한다", async () => {
    // Arrange
    const batch = createInstantBatch();
    const first = createHeld<string | undefined>();
    const second = createHeld<string | undefined>();
    const started: string[] = [];

    // Act
    const firstResult = batch.run(() => {
      started.push("first");
      return first.start();
    }, vi.fn());
    const secondResult = batch.run(() => {
      started.push("second");
      return second.start();
    }, vi.fn());
    await flush();

    // Assert: 앞 저장이 끝나기 전에는 다음 저장을 보내지 않는다(서버의 한 칸 바꾸기가 누른 순서대로 일어나야 한다)
    expect(started).toEqual(["first"]);

    // Act
    first.finish(undefined);
    await expect(firstResult).resolves.toBe(false);
    await flush();
    expect(started).toEqual(["first", "second"]);
    second.finish(undefined);

    // Assert
    await expect(secondResult).resolves.toBe(true);
  });

  // 저장은 빨리 끝나 연달아 눌러도 겹치지 않으므로, 끝난 뒤 잠깐 기다리며 다음 누름을 묶는다
  it("저장이 끝난 뒤 기다리는 동안 또 저장하면 앞 저장은 새로 고치지 않고 뒤 저장이 묶음을 끝낸다", async () => {
    // Arrange
    const settles: { finish: (result: void) => void }[] = [];
    const batch = createTodoSaveBatch({
      wait: () => {
        const settle = createHeld<void>();
        settles.push(settle);
        return settle.start();
      },
    });
    const firstResult = batch.run(async () => undefined, vi.fn());
    await flush();

    // Act: 첫 저장이 끝나고 기다리는 중에 다시 누른다
    const secondResult = batch.run(async () => undefined, vi.fn());
    await flush();
    settles[0]?.finish();
    settles[1]?.finish();

    // Assert
    await expect(firstResult).resolves.toBe(false);
    await expect(secondResult).resolves.toBe(true);
    expect(settles).toHaveLength(2);
  });

  // 세션이 끊겼을 때 다시 불러오면 로그인 화면으로 넘어가 다시 로그인 창이 소용없어진다(#102)
  it("모두 저장하지 못했으면 새로 고치지 않고, 하나라도 저장했으면 마지막에 새로 고치게 한다", async () => {
    // Arrange
    const failedBatch = createInstantBatch();
    const mixedBatch = createInstantBatch();
    const onSaved = vi.fn();

    // Act
    const failedResults = await Promise.all([
      failedBatch.run(async () => TODO_ACTION_FAILED_MESSAGE, onSaved),
      failedBatch.run(async () => TODO_ACTION_FAILED_MESSAGE, onSaved),
    ]);
    const mixedResults = await Promise.all([mixedBatch.run(async () => undefined, vi.fn()), mixedBatch.run(async () => TODO_ACTION_FAILED_MESSAGE, vi.fn())]);

    // Assert
    expect(failedResults).toEqual([false, false]);
    expect(onSaved).toHaveBeenCalledWith(TODO_ACTION_FAILED_MESSAGE);
    expect(mixedResults).toEqual([false, true]);
  });

  it("상대가 지운 항목이면 서버 목록으로 맞추도록 새로 고치게 한다", async () => {
    // Arrange
    const batch = createInstantBatch();
    const onSaved = vi.fn();

    // Act
    const shouldRefresh = await batch.run(async () => TODO_ALREADY_DELETED_MESSAGE, onSaved);

    // Assert
    expect(onSaved).toHaveBeenCalledWith(TODO_ALREADY_DELETED_MESSAGE);
    expect(shouldRefresh).toBe(true);
  });

  it("한 묶음이 끝나면 다음 묶음은 새로 센다", async () => {
    // Arrange
    const batch = createInstantBatch();
    await batch.run(async () => undefined, vi.fn());

    // Act
    const shouldRefresh = await batch.run(async () => TODO_ACTION_FAILED_MESSAGE, vi.fn());

    // Assert
    expect(shouldRefresh).toBe(false);
  });

  it("저장이 예외로 끝나도 다음 저장은 이어서 하고 마지막을 바르게 센다", async () => {
    // Arrange
    const batch = createInstantBatch();

    // Act
    const thrown = batch.run(async () => Promise.reject(new Error("끊김")), vi.fn());
    const next = batch.run(async () => undefined, vi.fn());

    // Assert
    await expect(thrown).rejects.toThrow("끊김");
    await expect(next).resolves.toBe(true);
  });

  it("기다리는 시간을 주지 않으면 0.7초 기다린다", async () => {
    // Arrange
    vi.useFakeTimers();
    const batch = createTodoSaveBatch();
    let isDone = false;

    // Act
    const result = batch.run(async () => undefined, vi.fn()).then((shouldRefresh) => {
      isDone = true;
      return shouldRefresh;
    });
    await vi.advanceTimersByTimeAsync(699);
    const isDoneBefore = isDone;
    await vi.advanceTimersByTimeAsync(1);

    // Assert
    expect(isDoneBefore).toBe(false);
    await expect(result).resolves.toBe(true);
    vi.useRealTimers();
  });
});
