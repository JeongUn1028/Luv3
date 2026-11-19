import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./service-worker";

describe("registerServiceWorker", () => {
  it("서비스 워커를 앱 전체 범위로, HTTP 저장본을 거치지 않게 등록한다", async () => {
    // Arrange
    const registration = {} as ServiceWorkerRegistration;
    const register = vi.fn(() => Promise.resolve(registration));

    // Act
    const result = await registerServiceWorker({ register });

    // Assert
    expect(register).toHaveBeenCalledWith("/sw.js", { scope: "/", updateViaCache: "none" });
    expect(result).toBe(registration);
  });
});
