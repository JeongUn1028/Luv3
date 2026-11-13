import { describe, expect, it } from "vitest";
import { isIosDevice, isSameServerKey, toApplicationServerKey, toPushStatus, toPushSupport, toStoredSubscription } from "./subscription";

const IPHONE_SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const MAC_SAFARI = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID_CHROME = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";

describe("toPushSupport", () => {
  it("알림 API가 있으면 켤 수 있다", () => {
    // Act & Assert
    expect(toPushSupport({ hasPushApi: true, isIos: true, isStandalone: true })).toBe("supported");
  });

  // 아이폰 Safari는 홈 화면에 추가한 앱에서만 알림 API가 생긴다
  it("아이폰 Safari에서 열었으면 홈 화면에 추가하라고 안내한다", () => {
    // Act & Assert
    expect(toPushSupport({ hasPushApi: false, isIos: true, isStandalone: false })).toBe("needs-install");
  });

  it.each([
    ["홈 화면 앱인데 API가 없으면(iOS 16.4 미만)", true, true],
    ["아이폰이 아닌 브라우저에 API가 없으면", false, false],
  ])("%s 켤 수 없다", (_, isIos, isStandalone) => {
    // Act & Assert
    expect(toPushSupport({ hasPushApi: false, isIos, isStandalone })).toBe("unsupported");
  });
});

describe("isIosDevice", () => {
  it.each([
    ["아이폰", IPHONE_SAFARI, 5, true],
    ["맥처럼 알리는 아이패드", MAC_SAFARI, 5, true],
    ["맥", MAC_SAFARI, 0, false],
    ["안드로이드", ANDROID_CHROME, 5, false],
  ])("%s → %s", (_, userAgent, maxTouchPoints, expected) => {
    // Act & Assert
    expect(isIosDevice({ userAgent, maxTouchPoints })).toBe(expected);
  });
});

describe("toPushStatus", () => {
  it.each([
    ["needs-install", "default", false, "needs-install"],
    ["unsupported", "default", false, "unsupported"],
  ] as const)("켤 수 없는 브라우저(%s)는 허락 상태와 상관없이 그대로 보인다", (support, permission, hasSubscription, expected) => {
    // Act & Assert
    expect(toPushStatus({ support, permission, hasSubscription })).toBe(expected);
  });

  it.each([
    ["거절했으면", "denied", true, "denied"],
    ["허락하고 구독이 있으면", "granted", true, "on"],
    ["허락했지만 구독이 없으면", "granted", false, "off"],
    ["아직 묻지 않았으면", "default", false, "off"],
  ] as const)("%s %s", (_, permission, hasSubscription, expected) => {
    // Act & Assert
    expect(toPushStatus({ support: "supported", permission, hasSubscription })).toBe(expected);
  });
});

describe("toApplicationServerKey", () => {
  it("base64url 공개 키를 바이트로 바꾼다(빠진 = 채우기, -·_ 바꾸기)", () => {
    // Arrange: 0xfb 0xff 0xbf는 base64로 "+/+/", base64url로 "-_-_"
    const base64Url = "-_-_AQ";

    // Act
    const key = toApplicationServerKey(base64Url);

    // Assert
    expect([...key]).toEqual([0xfb, 0xff, 0xbf, 0x01]);
  });
});

describe("isSameServerKey", () => {
  const expected = Uint8Array.from([1, 2, 3]);

  it.each([
    ["같은 바이트면", Uint8Array.from([1, 2, 3]).buffer, true],
    ["한 바이트라도 다르면", Uint8Array.from([1, 2, 4]).buffer, false],
    ["길이가 다르면", Uint8Array.from([1, 2]).buffer, false],
    ["구독에 키가 없으면", null, false],
  ])("%s %s", (_, current, result) => {
    // Act & Assert
    expect(isSameServerKey(current, expected)).toBe(result);
  });
});

describe("toStoredSubscription", () => {
  it("구독에서 저장할 주소와 키 두 개를 꺼낸다", () => {
    // Act
    const stored = toStoredSubscription({ endpoint: "https://push.example/1", expirationTime: null, keys: { p256dh: "key", auth: "secret" } });

    // Assert
    expect(stored).toEqual({ endpoint: "https://push.example/1", p256dh: "key", auth: "secret" });
  });

  it.each([
    ["주소가 없으면", { keys: { p256dh: "key", auth: "secret" } }],
    ["키가 없으면", { endpoint: "https://push.example/1" }],
    ["인증 값이 없으면", { endpoint: "https://push.example/1", keys: { p256dh: "key" } }],
  ])("%s 멈춘다", (_, json) => {
    // Act & Assert
    expect(() => toStoredSubscription(json)).toThrow("알림 구독 정보");
  });
});
