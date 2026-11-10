import { afterEach, describe, expect, it, vi } from "vitest";
import { readSource } from "@/test-utils/source";
import { APP_RETURN_STALE_AFTER_MS, shouldRefreshOnReturn, subscribeToAppReturn } from "./app-return";

// 2026-11-09 12:00 (KST)
const NOON_KST = new Date("2026-11-09T12:00:00+09:00").getTime();
const MINUTE_MS = 60_000;

describe("shouldRefreshOnReturn", () => {
  it("받은 지 30분이 안 됐고 날짜가 같으면 새로 받지 않는다", () => {
    expect(shouldRefreshOnReturn(NOON_KST, NOON_KST + APP_RETURN_STALE_AFTER_MS - 1)).toBe(false);
  });

  it("받은 지 30분이 지나면 새로 받는다", () => {
    expect(APP_RETURN_STALE_AFTER_MS).toBe(30 * MINUTE_MS);
    expect(shouldRefreshOnReturn(NOON_KST, NOON_KST + APP_RETURN_STALE_AFTER_MS)).toBe(true);
  });

  it("한국 날짜가 바뀌면 30분이 안 돼도 새로 받는다", () => {
    // Arrange: 23:55에 받은 화면
    const loadedAt = new Date("2026-11-09T23:55:00+09:00").getTime();

    // Act
    const results = [shouldRefreshOnReturn(loadedAt, loadedAt + 4 * MINUTE_MS), shouldRefreshOnReturn(loadedAt, loadedAt + 6 * MINUTE_MS)];

    // Assert
    expect(results).toEqual([false, true]);
  });

  it("언제 받았는지 모르는 화면은 새로 받는다", () => {
    expect(shouldRefreshOnReturn(undefined, NOON_KST)).toBe(true);
  });
});

describe("subscribeToAppReturn", () => {
  /** 테스트는 node에서 돌아 화면이 없으므로, 알림만 주고받는 document·window를 둔다 */
  const stubScreen = (visibilityState: DocumentVisibilityState) => {
    const fakeDocument = Object.assign(new EventTarget(), { visibilityState });
    const fakeWindow = new EventTarget();
    vi.stubGlobal("document", fakeDocument);
    vi.stubGlobal("window", fakeWindow);
    return { fakeDocument, fakeWindow };
  };

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("화면이 보이게 되거나 저장된 페이지로 되살아나면 부른다", () => {
    // Arrange
    const { fakeDocument, fakeWindow } = stubScreen("visible");
    const onReturn = vi.fn();
    subscribeToAppReturn(onReturn);

    // Act
    fakeDocument.dispatchEvent(new Event("visibilitychange"));
    fakeWindow.dispatchEvent(new Event("pageshow"));

    // Assert
    expect(onReturn).toHaveBeenCalledTimes(2);
  });

  it("화면이 숨겨질 때는 부르지 않는다", () => {
    // Arrange
    const { fakeDocument } = stubScreen("hidden");
    const onReturn = vi.fn();
    subscribeToAppReturn(onReturn);

    // Act
    fakeDocument.dispatchEvent(new Event("visibilitychange"));

    // Assert
    expect(onReturn).not.toHaveBeenCalled();
  });

  it("듣기를 멈추면 더는 부르지 않는다", () => {
    // Arrange
    const { fakeDocument, fakeWindow } = stubScreen("visible");
    const onReturn = vi.fn();
    const unsubscribe = subscribeToAppReturn(onReturn);

    // Act
    unsubscribe();
    fakeDocument.dispatchEvent(new Event("visibilitychange"));
    fakeWindow.dispatchEvent(new Event("pageshow"));

    // Assert
    expect(onReturn).not.toHaveBeenCalled();
  });
});

// 루트 레이아웃의 앱 복귀, 화면이 다시 보일 때 새로 받기, 쓰던 폼 지키기, 기록을 되돌아간 화면 적기는 e2e/app-return.spec.ts가 잰다
describe("앱 복귀 연결", () => {
  it("저장된 페이지로 돌아올 때도 확인하고, 로그인을 확인하는 새로 받기를 쓴다", () => {
    const source = readSource("components/AppReturn.tsx");

    expect(source).toContain("subscribeToAppReturn(handleReturn)");
    // 로그아웃 상태로 앱에 돌아오는 경우는 E2E가 지나지 않는다(#102)
    expect(source).toContain("refreshSignedInScreen(");
  });

  it("사용자가 누르지 않은 새로 받기는 폼을 지키고, 로그인이 살아 있을 때만, 확인한 화면 그대로일 때만 받으며, 받은 화면을 적는다", () => {
    const source = readSource("lib/navigation/refresh-signed-in.ts");

    // 폼이면 서버에 묻기 전에 미룬다(#164)
    expect(source).toMatch(/if \(isWritingNow\(\)\) \{\s*markAllScreensStale\(\);\s*return false;\s*\}\s*const \{ href \} = window\.location;\s*const \{ data \} = await createClient\(\)\.auth\.getUser\(\);/);
    // 로그인이 풀렸으면 서버가 로그인 화면으로 보내 숨겨 둔 폼까지 잃는다(#102)
    expect(source).toContain("if (!data.user || window.location.href !== href) return false;");
    // 적힌 적 없는 화면은 앱에 돌아올 때마다 새로 받게 된다
    expect(source).toContain("markScreenLoaded(href, href);");
    expect(readSource("components/SignedPhoto.tsx")).toContain("refreshSignedInScreen(");
  });

  it("서명 주소로 받는 사진은 실패하면 다시 받는다", () => {
    for (const at of ["components/dates/AlbumGrid.tsx", "components/dates/PhotoCarousel.tsx", "components/RememberedPhoto.tsx"]) {
      const source = readSource(at);

      expect(source, at).toContain("<SignedPhoto");
      expect(source, at).not.toContain("<img");
    }
    // 홈 사진은 휴대폰이 기억한 주소로 그리고(#219), 그 주소로 받지 못하면 서버 주소로 다시 받는다
    for (const at of ["components/home/CouplePhoto.tsx", "components/home/LatestRecordCard.tsx"]) {
      const source = readSource(at);

      expect(source, at).toContain("<RememberedPhoto");
      expect(source, at).not.toContain("<img");
    }
  });
});
