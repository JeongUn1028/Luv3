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
