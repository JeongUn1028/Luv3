import { describe, expect, it } from "vitest";
import { isIosSafari, shouldShowInstallHint, type InstallEnvironment } from "./install";

const IPHONE_SAFARI =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPHONE_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_MODE =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";

const environment = (overrides: Partial<InstallEnvironment> = {}): InstallEnvironment => ({
  userAgent: IPHONE_SAFARI,
  maxTouchPoints: 5,
  isStandalone: false,
  isDismissed: false,
  ...overrides,
});

describe("isIosSafari", () => {
  it("아이폰·아이패드 Safari만 참이다", () => {
    expect(isIosSafari(IPHONE_SAFARI, 5)).toBe(true);
    // iPadOS Safari는 데스크톱 Mac처럼 자신을 알리므로 터치 지점 수로 구분한다
    expect(isIosSafari(IPAD_DESKTOP_MODE, 5)).toBe(true);
  });

  it("다른 브라우저와 기기는 거짓이다", () => {
    expect(isIosSafari(IPHONE_CHROME, 5)).toBe(false);
    expect(isIosSafari(IPAD_DESKTOP_MODE, 0)).toBe(false);
    expect(isIosSafari(ANDROID_CHROME, 5)).toBe(false);
  });
});

describe("shouldShowInstallHint", () => {
  it("iOS Safari에서 아직 홈 화면 앱이 아니고 닫은 적이 없으면 보여 준다", () => {
    expect(shouldShowInstallHint(environment())).toBe(true);
  });

  it("홈 화면 앱으로 열었거나, 닫은 적이 있거나, iOS Safari가 아니면 숨긴다", () => {
    expect(shouldShowInstallHint(environment({ isStandalone: true }))).toBe(false);
    expect(shouldShowInstallHint(environment({ isDismissed: true }))).toBe(false);
    expect(shouldShowInstallHint(environment({ userAgent: ANDROID_CHROME }))).toBe(false);
  });
});
