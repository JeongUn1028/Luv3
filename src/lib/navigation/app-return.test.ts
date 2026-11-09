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
    expect(source).toContain("refreshOutsideForm(");
    // 로그인이 풀렸으면 서버가 로그인 화면으로 보내 숨겨 둔 폼까지 잃는다(#102)
    expect(source).toMatch(/if \(!data\.user\) return;/);
  });

  it("서명 주소로 받는 사진은 실패하면 다시 받는다", () => {
    for (const at of ["components/dates/AlbumGrid.tsx", "components/dates/PhotoCarousel.tsx", "components/home/CouplePhoto.tsx", "components/home/LatestRecordCard.tsx"]) {
      const source = readSource(at);

      expect(source, at).toContain("<SignedPhoto");
      expect(source, at).not.toContain("<img");
    }
  });
});
