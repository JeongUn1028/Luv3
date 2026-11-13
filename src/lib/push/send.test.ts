import { describe, expect, it, vi } from "vitest";
import { PUSH_TEST_MESSAGE } from "./message";
import { sendPushMessage, type StoredPushSubscription } from "./send";

const subscription = (name: string): StoredPushSubscription => ({ endpoint: `https://push.example/${name}`, p256dh: "key", auth: "auth" });

/** web-push가 받는 쪽 상태 코드와 함께 던지는 오류(WebPushError)와 같은 모양 */
const pushError = (statusCode: number) => Object.assign(new Error("push failed"), { statusCode });

describe("sendPushMessage", () => {
  it("모든 기기에 같은 내용을 JSON으로 보내고 보낸 수를 센다", async () => {
    // Arrange
    const send = vi.fn(() => Promise.resolve());
    const subscriptions = [subscription("phone"), subscription("tablet")];

    // Act
    const result = await sendPushMessage({ subscriptions, message: PUSH_TEST_MESSAGE, send });

    // Assert
    expect(result).toEqual({ sentCount: 2, expiredEndpoints: [], failedCount: 0 });
    expect(send).toHaveBeenCalledWith(subscriptions[0], JSON.stringify(PUSH_TEST_MESSAGE));
    expect(send).toHaveBeenCalledWith(subscriptions[1], JSON.stringify(PUSH_TEST_MESSAGE));
  });

  it("알림 서비스가 404·410으로 답한 기기는 지울 구독으로 모은다", async () => {
    // Arrange
    const send = vi.fn((target: StoredPushSubscription) =>
      target.endpoint.endsWith("gone") ? Promise.reject(pushError(410)) : target.endpoint.endsWith("missing") ? Promise.reject(pushError(404)) : Promise.resolve(),
    );

    // Act
    const result = await sendPushMessage({
      subscriptions: [subscription("phone"), subscription("gone"), subscription("missing")],
      message: PUSH_TEST_MESSAGE,
      send,
    });

    // Assert
    expect(result).toEqual({
      sentCount: 1,
      expiredEndpoints: ["https://push.example/gone", "https://push.example/missing"],
      failedCount: 0,
    });
  });

  // 알림 서비스 장애나 네트워크 오류로 구독을 지우면 그 기기는 다시 켜기 전까지 알림을 못 받는다.
  // 403은 서버의 알림 열쇠가 구독을 만든 열쇠와 다를 때 온다. 열쇠를 잘못 넣으면 모든 기기가 403이라 지우면 전부 사라진다(#366 리뷰)
  it.each([
    ["열쇠가 맞지 않음(403)", pushError(403)],
    ["알림 서비스 장애(500)", pushError(500)],
    ["너무 많은 요청(429)", pushError(429)],
    ["상태 코드 없는 네트워크 오류", new Error("ECONNRESET")],
    ["오류 객체가 아닌 값", "boom"],
  ])("%s는 실패로만 세고 구독은 지우지 않는다", async (_, reason) => {
    // Arrange
    const send = vi.fn(() => Promise.reject(reason));

    // Act
    const result = await sendPushMessage({ subscriptions: [subscription("phone")], message: PUSH_TEST_MESSAGE, send });

    // Assert
    expect(result).toEqual({ sentCount: 0, expiredEndpoints: [], failedCount: 1 });
  });

  it("기기가 없으면 보내지 않는다", async () => {
    // Arrange
    const send = vi.fn(() => Promise.resolve());

    // Act
    const result = await sendPushMessage({ subscriptions: [], message: PUSH_TEST_MESSAGE, send });

    // Assert
    expect(result).toEqual({ sentCount: 0, expiredEndpoints: [], failedCount: 0 });
    expect(send).not.toHaveBeenCalled();
  });
});
