import { describe, expect, it } from "vitest";
import { readSource } from "@/test-utils/source";
import { APP_RETURN_STALE_AFTER_MS, shouldRefreshOnReturn } from "./app-return";

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

describe("앱 복귀 연결", () => {
  it("루트 레이아웃에서 앱 복귀를 챙긴다", () => {
    expect(readSource("app/layout.tsx")).toContain("<AppReturn />");
  });

  it("화면이 다시 보일 때와 저장된 페이지로 돌아올 때 확인하고, 쓰던 폼은 지킨다", () => {
    const source = readSource("components/AppReturn.tsx");

    expect(source).toContain('document.addEventListener("visibilitychange", handleReturn)');
    expect(source).toContain('window.addEventListener("pageshow", handleReturn)');
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
    expect(readSource("components/HistoryReturn.tsx")).toContain("markScreenLoaded(href, href);");
    expect(readSource("components/SignedPhoto.tsx")).toContain("refreshSignedInScreen(");
  });

  it("서명 주소로 받는 사진은 실패하면 다시 받는다", () => {
    for (const at of ["components/dates/AlbumGrid.tsx", "components/dates/PhotoCarousel.tsx", "components/home/CouplePhoto.tsx", "components/home/LatestRecordCard.tsx"]) {
      const source = readSource(at);

      expect(source, at).toContain("<SignedPhoto");
      expect(source, at).not.toContain("<img");
    }
  });
});
