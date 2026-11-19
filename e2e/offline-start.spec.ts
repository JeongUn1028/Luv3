import type { Page } from "@playwright/test";
import { getTab } from "./support/actions";
import { expect, openScreen, test } from "./support/test";

// 끊긴 채 앱을 켜거나 새로 고칠 때의 안내 화면(#365)은 실제 서비스 워커가 돌려준다. 다른 스펙은 서비스 워커를 막아 둔다(playwright.config.ts)
test.use({ serviceWorkers: "allow" });

const OFFLINE_HEADING = "인터넷에 연결되어 있지 않아요";

/** 앱을 연 뒤 서비스 워커가 이 화면을 맡고 안내 화면을 저장해 둘 때까지 기다린다 */
const waitForOfflinePage = async (page: Page): Promise<void> => {
  await page.waitForFunction(async () => {
    if (!navigator.serviceWorker.controller) return false;
    return Boolean(await caches.match("/offline.html"));
  });
};

test.describe("끊긴 채 앱을 새로 고치면", () => {
  test("브라우저 오류 화면 대신 안내 화면이 나오고, 다시 연결해 다시 시도하면 열려던 화면이 열린다", async ({ page, context }) => {
    // Arrange
    await openScreen(page, "/records", page.getByRole("heading", { name: "기록" }));
    await waitForOfflinePage(page);
    await context.setOffline(true);

    // Act
    await page.reload();

    // Assert
    await expect(page.getByRole("heading", { name: OFFLINE_HEADING })).toBeVisible();
    await expect(page).toHaveURL(/\/records$/);

    // Act: 다시 연결해 다시 시도
    await context.setOffline(false);
    await page.getByRole("link", { name: "다시 시도" }).tap();

    // Assert
    await expect(page.getByRole("heading", { name: "기록" })).toBeVisible();
    await expect(getTab(page, "/records")).toBeVisible();
    await expect(page).toHaveURL(/\/records$/);
  });

  test("끊긴 채 다시 시도하면 안내 화면에 머문다", async ({ page, context }) => {
    // Arrange
    await openScreen(page, "/", getTab(page, "/records"));
    await waitForOfflinePage(page);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: OFFLINE_HEADING })).toBeVisible();

    // Act
    await page.getByRole("link", { name: "다시 시도" }).tap();

    // Assert
    await expect(page.getByRole("heading", { name: OFFLINE_HEADING })).toBeVisible();
  });
});
