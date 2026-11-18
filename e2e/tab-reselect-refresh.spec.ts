import { randomUUID } from "node:crypto";
import type { Locator, Page, Request, Route } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { getTab, isScreenRequest } from "./support/actions";
import { createTestName } from "./support/names";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const getTodoText = (page: Page, content: string): Locator => page.locator("main").locator("visible=true").getByText(content);
const getRefreshStatus = (page: Page): Locator => page.getByRole("status").filter({ hasText: "새로 받는 중이에요" });
const getScrollArea = (page: Page): Locator => page.locator("main > .overflow-y-auto").locator("visible=true");

/** `pathname` 화면을 서버에 다시 묻는 요청을 모은다 */
const collectScreenRequests = (page: Page, pathname: string): Request[] => {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (isScreenRequest(request, pathname)) requests.push(request);
  });
  return requests;
};

/** 화면을 다시 받는 응답을 붙들어, 받는 동안의 표시를 볼 수 있게 한다 */
const holdScreenResponse = async (page: Page, pathname: string): Promise<() => void> => {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(`**${pathname}?*`, async (route: Route) => {
    if (isScreenRequest(route.request(), pathname)) await released;
    await route.continue();
  });
  return release;
};

test.describe("지금 탭을 다시 누르면(#351)", () => {
  test("맨 위에 있으면 새로 받아 상대가 더한 항목이 보이고, 받는 동안 표시가 보이며 또 눌러도 한 번만 받는다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 탭 다시 누르기", testInfo);
    await openScreen(page, TODOS_PATH, getTab(page, TODOS_PATH));
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content });
    const release = await holdScreenResponse(page, TODOS_PATH);
    const requests = collectScreenRequests(page, TODOS_PATH);
    try {
      // Act
      await getTab(page, TODOS_PATH).tap();
      await expect(getRefreshStatus(page)).toBeAttached();
      await getTab(page, TODOS_PATH).tap();
      release();

      // Assert
      await expect(getTodoText(page, content)).toBeVisible();
      await expect(getRefreshStatus(page)).toHaveCount(0);
      expect(requests).toHaveLength(1);
    } finally {
      release();
      await deleteTodo();
    }
  });

  test("맨 위가 아니면 맨 위로만 올리고 새로 받지 않는다", async ({ page }, testInfo) => {
    // Arrange: 스크롤할 만큼 항목을 넣는다
    const prefix = createTestName("E2E 탭 스크롤", testInfo);
    const deletes = await Promise.all(Array.from({ length: 16 }, (_, index) => createDisposableTodo({ id: randomUUID(), content: `${prefix} ${index}` })));
    try {
      await openScreen(page, TODOS_PATH, getTodoText(page, `${prefix} 0`));
      await getScrollArea(page).evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      const requests = collectScreenRequests(page, TODOS_PATH);

      // Act
      await getTab(page, TODOS_PATH).tap();

      // Assert
      await expect.poll(() => getScrollArea(page).evaluate((element) => element.scrollTop)).toBe(0);
      await page.waitForTimeout(1_500);
      expect(requests).toHaveLength(0);
    } finally {
      await Promise.all(deletes.map((remove) => remove()));
    }
  });

  // 새로 받으면 서버가 로그인 화면으로 보내 다시 로그인 창이 소용없어진다(#102)
  test("로그인이 끊겼으면 새로 받지 않고 지금 화면에 남는다", async ({ page }) => {
    // Arrange
    await openScreen(page, TODOS_PATH, getTab(page, TODOS_PATH));
    await page.context().clearCookies();
    const requests = collectScreenRequests(page, TODOS_PATH);

    // Act
    await getTab(page, TODOS_PATH).tap();

    // Assert
    await page.waitForTimeout(1_500);
    expect(requests).toHaveLength(0);
    expect(new URL(page.url()).pathname).toBe(TODOS_PATH);
  });
});
