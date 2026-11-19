import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockClientModule = () => vi.doMock("./client", () => ({ createClient: () => ({ name: "client" }) }));
const mockMissingClientModule = () =>
  vi.doMock("./client", () => {
    throw new Error("파일을 받지 못함");
  });

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.doUnmock("./client");
  vi.restoreAllMocks();
});

describe("loadClient", () => {
  it("쓸 때 불러와 클라이언트를 만든다", async () => {
    // Arrange
    mockClientModule();
    const { loadClient } = await import("./load-client");

    // Act
    const client = await loadClient();

    // Assert
    expect(client).toEqual({ name: "client" });
  });

  // 끊김이나 배포로 한 번 받지 못해도 다음에 쓸 때는 다시 받아야 한다
  it("받지 못하면 던지고, 다음에 다시 받는다", async () => {
    // Arrange
    mockMissingClientModule();
    const { loadClient } = await import("./load-client");

    // Act & Assert
    await expect(loadClient()).rejects.toThrow();
    mockClientModule();
    await expect(loadClient()).resolves.toEqual({ name: "client" });
  });
});

describe("withLoadedClient", () => {
  it("불러온 클라이언트로 요청한 결과를 돌려준다", async () => {
    // Arrange
    mockClientModule();
    const { withLoadedClient } = await import("./load-client");

    // Act
    const result = await withLoadedClient({ request: async (client) => client, onLoadFailed: () => undefined });

    // Assert
    expect(result).toEqual({ name: "client" });
  });

  // 던지면 저장 중에 멈추거나 오류 화면으로 넘어가므로, 요청을 보내지 못한 실패로 돌려준다
  it("받지 못하면 던지지 않고 기록을 남긴 뒤 받지 못했을 때의 값을 돌려준다", async () => {
    // Arrange
    mockMissingClientModule();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { withLoadedClient } = await import("./load-client");
    const request = vi.fn(async () => "saved");

    // Act
    const result = await withLoadedClient({ request, onLoadFailed: () => "failed" });

    // Assert
    expect(result).toBe("failed");
    expect(request).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledOnce();
  });

  // 설정 값 같은 문제를 "받지 못함"으로 숨기면 원인을 찾을 수 없다
  it("받은 뒤 클라이언트를 만들다 던진 오류는 그대로 던진다", async () => {
    // Arrange
    vi.doMock("./client", () => ({
      createClient: () => {
        throw new Error("설정 값 없음");
      },
    }));
    const { withLoadedClient } = await import("./load-client");

    // Act & Assert
    await expect(withLoadedClient({ request: async () => "saved", onLoadFailed: () => "failed" })).rejects.toThrow("설정 값 없음");
  });

  // 요청 중 오류는 부르는 쪽이 이미 다루므로 받지 못했을 때의 값으로 바꾸지 않는다
  it("요청이 던진 오류는 그대로 던진다", async () => {
    // Arrange
    mockClientModule();
    const { withLoadedClient } = await import("./load-client");

    // Act & Assert
    await expect(
      withLoadedClient({
        request: async () => {
          throw new Error("요청 실패");
        },
        onLoadFailed: () => "failed",
      }),
    ).rejects.toThrow("요청 실패");
  });
});

describe("preloadClient", () => {
  it("미리 받지 못하면 던지지 않고 기록만 남긴다", async () => {
    // Arrange
    mockMissingClientModule();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { preloadClient } = await import("./load-client");

    // Act
    preloadClient();

    // Assert
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledOnce());
  });
});
