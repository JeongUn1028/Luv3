import { randomUUID } from "node:crypto";
import type { Locator, Page, Request } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { PHOTO_RECORD } from "./support/constants";
import { installClockBeforeMidnight, returnToApp } from "./support/actions";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

const MINUTE_MS = 60_000;

const getTodo = (page: Page, content: string): Locator => page.locator("main").locator("visible=true").getByText(content);

/** 미리 받기가 아닌 화면 요청(이동과 다시 불러오기)인지 */
const isScreenRequest = (request: Request, pathname: string): boolean => {
  const headers = request.headers();
  return headers["rsc"] === "1" && headers["next-router-prefetch"] === undefined && new URL(request.url()).pathname === pathname;
};

test.describe("홈 화면 앱으로 돌아오면", () => {
  test("받은 지 30분이 지났으면 지금 화면을 새로 받아 상대가 더한 내용이 보인다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 30분 뒤 복귀", testInfo);
    await page.clock.install();
    await openScreen(page, TODOS_PATH, page.locator("main ul"));
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content });
    try {
      // Act
      await page.clock.fastForward(31 * MINUTE_MS);
      await returnToApp(page);

      // Assert
      await expect(getTodo(page, content)).toBeVisible();
    } finally {
      await deleteTodo();
    }
  });

  test("잠깐 다녀왔으면 새로 받지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 잠깐 복귀", testInfo);
    await page.clock.install();
    await openScreen(page, TODOS_PATH, page.locator("main ul"));
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content });
    const refreshes: Request[] = [];
    page.on("request", (request) => {
      if (isScreenRequest(request, TODOS_PATH)) refreshes.push(request);
    });
    try {
      // Act
      await page.clock.fastForward(5 * MINUTE_MS);
      await returnToApp(page);

      // Assert: 다시 불러오는 응답이 올 만큼 기다린다
      await page.waitForTimeout(2_000);
      expect(refreshes).toHaveLength(0);
      await expect(getTodo(page, content)).toHaveCount(0);
    } finally {
      await deleteTodo();
    }
  });

  test("한국 날짜가 바뀌었으면 30분이 안 돼도 새로 받는다", async ({ page }, testInfo) => {
    // Arrange: 오늘 0시 10분 전에 연 것으로 친다
    const content = createTestName("E2E 자정 넘겨 복귀", testInfo);
    await installClockBeforeMidnight(page);
    await openScreen(page, TODOS_PATH, page.locator("main ul"));
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content });
    try {
      // Act
      await page.clock.fastForward(15 * MINUTE_MS);
      await returnToApp(page);

      // Assert
      await expect(getTodo(page, content)).toBeVisible();
    } finally {
      await deleteTodo();
    }
  });

  test("폼을 쓰는 중이면 쓰던 내용을 지키고, 목록으로 돌아가면 새로 받는다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 폼에서 복귀", testInfo);
    await page.clock.install();
    await openScreen(page, TODOS_PATH, page.locator("main ul"));
    await page.locator('a[href="/todos/new"]').locator("visible=true").first().tap();
    await page.waitForURL("**/todos/new");
    await page.locator("#todo-content").locator("visible=true").fill("쓰던 하고 싶은 것");
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content });
    try {
      // Act
      await page.clock.fastForward(31 * MINUTE_MS);
      await returnToApp(page);

      // Assert
      await page.waitForTimeout(2_000);
      await expect(page.locator("#todo-content").locator("visible=true")).toHaveValue("쓰던 하고 싶은 것");
      await page.goBack();
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(getTodo(page, content)).toBeVisible();

      // Assert: 뒤로 와서 새로 받은 목록은 받은 때가 적혀, 잠깐 다녀오면 다시 받지 않는다
      await page.waitForLoadState("networkidle");
      const refreshes: Request[] = [];
      page.on("request", (request) => {
        if (isScreenRequest(request, TODOS_PATH)) refreshes.push(request);
      });
      await page.clock.fastForward(MINUTE_MS);
      await returnToApp(page);
      await page.waitForTimeout(2_000);
      expect(refreshes).toHaveLength(0);
    } finally {
      await deleteTodo();
    }
  });
});

test("사진을 받지 못하면 화면을 새로 받아 다시 받는다", async ({ page }) => {
  // Arrange: 만료된 주소처럼 첫 요청만 거절한다
  let failedCount = 0;
  await page.route("**/storage/v1/object/sign/**", (route) => {
    if (failedCount === 0 && route.request().url().includes(PHOTO_RECORD.id)) {
      failedCount += 1;
      return route.fulfill({ status: 400, json: { statusCode: "400", error: "InvalidJWT", message: '"exp" claim timestamp check failed' } });
    }
    return route.continue();
  });
  const refresh = page.waitForRequest((request) => isScreenRequest(request, RECORDS_PATH));

  // Act
  await page.goto(RECORDS_PATH);

  // Assert
  await refresh;
  const photo = page.getByRole("img", { name: PHOTO_RECORD.title }).locator("visible=true");
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);
  expect(failedCount).toBe(1);
});
