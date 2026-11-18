import { describe, expect, it, vi } from "vitest";
import { createLatestReloader } from "./reload";

/** 부를 때마다 새 약속을 만들고, 테스트가 차례를 정해 풀어 준다 */
const createControlledRead = () => {
  const pending: { resolve: (value: string) => void; reject: (error: unknown) => void }[] = [];
  const read = vi.fn(
    () =>
      new Promise<string>((resolve, reject) => {
        pending.push({ resolve, reject });
      }),
  );
  return { read, pending };
};

describe("createLatestReloader", () => {
  it("다시 읽은 결과를 넘겨 준다", async () => {
    // Arrange
    const { read, pending } = createControlledRead();
    const onLoaded = vi.fn();
    const reload = createLatestReloader({ read, onLoaded, onFailed: vi.fn() });

    // Act
    const done = reload("요청");
    pending[0]?.resolve("첫 목록");
    await done;

    // Assert
    expect(read).toHaveBeenCalledWith("요청");
    expect(onLoaded).toHaveBeenCalledExactlyOnceWith("첫 목록", "요청");
  });

  it("먼저 보낸 요청이 늦게 돌아오면 그 결과는 버린다", async () => {
    // Arrange: 남기기 뒤 읽기와 지우기 뒤 읽기가 겹친다
    const { read, pending } = createControlledRead();
    const onLoaded = vi.fn();
    const reload = createLatestReloader({ read, onLoaded, onFailed: vi.fn() });
    const first = reload("먼저");
    const second = reload("나중");

    // Act: 나중 요청이 먼저 돌아온다
    pending[1]?.resolve("나중 목록");
    await second;
    pending[0]?.resolve("먼저 목록");
    await first;

    // Assert
    expect(onLoaded).toHaveBeenCalledExactlyOnceWith("나중 목록", "나중");
  });

  it("읽지 못하면 원인을 알리고, 그 뒤에 보낸 요청이 있으면 알리지 않는다", async () => {
    // Arrange
    const { read, pending } = createControlledRead();
    const onFailed = vi.fn();
    const reload = createLatestReloader({ read, onLoaded: vi.fn(), onFailed });
    const cause = new Error("끊김");

    // Act
    const failed = reload(undefined);
    pending[0]?.reject(cause);
    await failed;
    const stale = reload(undefined);
    void reload(undefined);
    pending[1]?.reject(new Error("늦은 실패"));
    await stale;

    // Assert
    expect(onFailed).toHaveBeenCalledExactlyOnceWith(cause);
  });
});
