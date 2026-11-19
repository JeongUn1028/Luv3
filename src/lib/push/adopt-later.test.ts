import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { adoptThisDevicePushSubscription } from "./device-subscription";
import { ADOPT_TIMEOUT, adoptThisDevicePushSubscriptionLater } from "./adopt-later";

vi.mock("./device-subscription", () => ({ adoptThisDevicePushSubscription: vi.fn() }));

describe("adoptThisDevicePushSubscriptionLater", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "열쇠");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.mocked(adoptThisDevicePushSubscription).mockReset();
  });

  it("불러와 이 기기 구독의 주인을 맞춘다", async () => {
    // Act
    await adoptThisDevicePushSubscriptionLater();

    // Assert
    expect(adoptThisDevicePushSubscription).toHaveBeenCalledOnce();
  });

  it("알림 열쇠가 없으면 불러오지 않는다", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");

    // Act
    await adoptThisDevicePushSubscriptionLater();

    // Assert
    expect(adoptThisDevicePushSubscription).not.toHaveBeenCalled();
  });

  // 로그인 뒤 이 일이 실패해도 다음 화면으로 옮겨야 한다
  it("실패해도 던지지 않고 기록만 남긴다", async () => {
    // Arrange
    vi.mocked(adoptThisDevicePushSubscription).mockRejectedValue(new Error("파일을 받지 못함"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    // Act
    await adoptThisDevicePushSubscriptionLater();

    // Assert
    expect(consoleError).toHaveBeenCalledOnce();
  });

  // 신호가 약해 파일이나 응답이 오지 않아도 로그인한 화면으로 옮기는 것을 오래 막지 않는다(#409)
  it("정한 시간이 지나면 끝나기를 기다리지 않는다", async () => {
    // Arrange
    vi.useFakeTimers();
    vi.mocked(adoptThisDevicePushSubscription).mockReturnValue(new Promise<void>(() => undefined));
    let isDone = false;

    // Act
    const adopting = adoptThisDevicePushSubscriptionLater().then(() => {
      isDone = true;
    });
    await vi.advanceTimersByTimeAsync(ADOPT_TIMEOUT);
    await adopting;

    // Assert
    expect(isDone).toBe(true);
  });
});
