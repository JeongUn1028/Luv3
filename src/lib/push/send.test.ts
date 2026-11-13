import { describe, expect, it, vi } from "vitest";
import type { PushMessage } from "./message";
import { sendPushMessage, toPushFailureReason, type StoredPushSubscription } from "./send";

const MESSAGE: PushMessage = { title: "새 기록", body: "11월 12일 · 한강", url: "/" };

const subscription = (name: string): StoredPushSubscription => ({ endpoint: `https://push.example/${name}`, p256dh: "key", auth: "auth" });

/** web-push가 받는 쪽 상태 코드와 함께 던지는 오류(WebPushError)와 같은 모양 */
const pushError = (statusCode: number, body = "") => Object.assign(new Error("Received unexpected response code"), { statusCode, body });

describe("sendPushMessage", () => {
  it("모든 기기에 같은 내용을 JSON으로 보내고 보낸 수를 센다", async () => {
    // Arrange
    const send = vi.fn(() => Promise.resolve());
    const subscriptions = [subscription("phone"), subscription("tablet")];

    // Act
    const result = await sendPushMessage({ subscriptions, message: MESSAGE, send });

    // Assert
    expect(result).toEqual({ sentCount: 2, expiredEndpoints: [], failedCount: 0, failureReasons: [] });
    expect(send).toHaveBeenCalledWith(subscriptions[0], JSON.stringify(MESSAGE));
    expect(send).toHaveBeenCalledWith(subscriptions[1], JSON.stringify(MESSAGE));
  });

  it("알림 서비스가 404·410으로 답한 기기는 지울 구독으로 모은다", async () => {
    // Arrange
    const send = vi.fn((target: StoredPushSubscription) =>
      target.endpoint.endsWith("gone") ? Promise.reject(pushError(410)) : target.endpoint.endsWith("missing") ? Promise.reject(pushError(404)) : Promise.resolve(),
    );

    // Act
    const result = await sendPushMessage({
      subscriptions: [subscription("phone"), subscription("gone"), subscription("missing")],
      message: MESSAGE,
      send,
    });

    // Assert
    expect(result).toEqual({
      sentCount: 1,
      expiredEndpoints: ["https://push.example/gone", "https://push.example/missing"],
      failedCount: 0,
      failureReasons: [],
    });
  });

  // 알림 서비스 장애나 네트워크 오류로 구독을 지우면 그 기기는 다시 켜기 전까지 알림을 못 받는다.
  // 403은 서버의 알림 열쇠가 구독을 만든 열쇠와 다를 때 온다. 열쇠를 잘못 넣으면 모든 기기가 403이라 지우면 전부 사라진다(#366 리뷰)
  it.each([
    ["열쇠가 맞지 않음(403)", pushError(403), "403"],
    ["알림 서비스 장애(500)", pushError(500), "500"],
    ["너무 많은 요청(429)", pushError(429), "429"],
    ["상태 코드 없는 네트워크 오류", new Error("ECONNRESET"), "ECONNRESET"],
    ["오류 객체가 아닌 값", "boom", "알 수 없는 오류"],
  ])("%s는 실패로만 세고 구독은 지우지 않는다", async (_, reason, expectedReason) => {
    // Arrange
    const send = vi.fn(() => Promise.reject(reason));

    // Act
    const result = await sendPushMessage({ subscriptions: [subscription("phone")], message: MESSAGE, send });

    // Assert
    expect(result).toEqual({ sentCount: 0, expiredEndpoints: [], failedCount: 1, failureReasons: [expectedReason] });
  });

  it("기기가 없으면 보내지 않는다", async () => {
    // Arrange
    const send = vi.fn(() => Promise.resolve());

    // Act
    const result = await sendPushMessage({ subscriptions: [], message: MESSAGE, send });

    // Assert
    expect(result).toEqual({ sentCount: 0, expiredEndpoints: [], failedCount: 0, failureReasons: [] });
    expect(send).not.toHaveBeenCalled();
  });

  // 로그에 기기 수만 남아 아이폰에서 "보내지 못했어요"의 원인을 가를 수 없었다(#368)
  it("지우지 않은 실패마다 이유를 순서대로 모은다", async () => {
    // Arrange
    const failures: Record<string, unknown> = {
      forbidden: pushError(403, '{"reason":"BadJwtToken"}'),
      gone: pushError(410),
      slow: new Error("Socket timeout"),
    };
    const send = vi.fn((target: StoredPushSubscription) => {
      const failure = failures[target.endpoint.replace("https://push.example/", "")];
      return failure ? Promise.reject(failure) : Promise.resolve();
    });

    // Act
    const result = await sendPushMessage({
      subscriptions: [subscription("forbidden"), subscription("phone"), subscription("gone"), subscription("slow")],
      message: MESSAGE,
      send,
    });

    // Assert
    expect(result.failureReasons).toEqual(["403 BadJwtToken", "Socket timeout"]);
  });
});

describe("toPushFailureReason", () => {
  it.each([
    ["애플처럼 JSON 사유를 주면 상태 코드와 사유를 붙인다", pushError(403, '{"reason":"BadJwtToken"}'), "403 BadJwtToken"],
    [
      "글자로 답하면 줄바꿈·빈칸을 하나로 줄여 붙인다",
      pushError(403, "  the key in the authorization header\n  does not correspond "),
      "403 the key in the authorization header does not correspond",
    ],
    ["본문이 없으면 상태 코드만 남긴다", pushError(500), "500"],
    ["JSON 사유가 없으면 message를 붙인다", pushError(401, '{"code":401,"errno":109,"error":"Unauthorized","message":"Request did not validate"}'), "401 Request did not validate"],
    ["message도 없으면 error를 붙인다", pushError(401, '{"code":401,"error":"Unauthorized"}'), "401 Unauthorized"],
    ["JSON 글자 하나로 답하면 그 글자를 붙인다", pushError(400, '"InvalidToken"'), "400 InvalidToken"],
    ["JSON이지만 읽을 사유가 없으면 상태 코드만 남긴다", pushError(400, '{"error":{}}'), "400"],
    ["HTML 오류 화면은 붙이지 않고 상태 코드만 남긴다", pushError(502, "<!DOCTYPE html><html><body>Bad Gateway</body></html>"), "502"],
    ["보내기 전 오류는 오류 문구를 남긴다", new Error("Vapid private key should be 32 bytes long when decoded."), "Vapid private key should be 32 bytes long when decoded."],
    ["시간 초과도 오류 문구를 남긴다", new Error("Socket timeout"), "Socket timeout"],
    ["오류 객체가 아니면 알 수 없는 오류로 남긴다", "boom", "알 수 없는 오류"],
  ])("%s", (_, reason, expected) => {
    // Act
    const result = toPushFailureReason(reason);

    // Assert
    expect(result).toBe(expected);
  });

  it("긴 사유는 100자까지만 남긴다", () => {
    // Arrange
    const reason = pushError(400, "x".repeat(300));

    // Act
    const result = toPushFailureReason(reason);

    // Assert
    expect(result).toBe(`400 ${"x".repeat(100)}…`);
  });

  it("자를 때 이모지 같은 두 칸 글자를 반으로 쪼개지 않는다", () => {
    // Arrange
    const reason = pushError(400, `${"x".repeat(99)}😀😀`);

    // Act
    const result = toPushFailureReason(reason);

    // Assert
    expect(result).toBe(`400 ${"x".repeat(99)}😀…`);
  });
});
