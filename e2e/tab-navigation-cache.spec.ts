import { randomUUID } from "node:crypto";
import type { Locator, Page, Request } from "@playwright/test";
import { HOME_PATH } from "@/lib/auth/paths";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { getTab, isScreenRequest } from "./support/actions";
import { createTestName } from "./support/names";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 다른 테스트가 넣은 항목보다 위에 와서 홈의 맨 위 세 개에 들어가게 한다
const TOP_SORT_ORDER = -1_000_000_000_000_000;

const getTodoText = (page: Page, content: string): Locator => page.locator("main").locator("visible=true").getByText(content);

/** 탭을 눌러 옮기고 그 탭이 지금 탭이 될 때까지 기다린다 */
const tapTab = async (page: Page, href: string): Promise<void> => {
  await getTab(page, href).tap();
  await page.locator(`nav a[href="${href}"][aria-current="page"]`).locator("visible=true").waitFor();
};

/** `pathname` 화면을 서버에 다시 묻는 요청을 모은다 */
const collectScreenRequests = (page: Page, pathname: string): Request[] => {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (isScreenRequest(request, pathname)) requests.push(request);
  });
  return requests;
};

test.describe("탭을 오갈 때(#405)", () => {
  test("받은 지 30초가 안 된 탭으로 돌아가면 서버에 다시 묻지 않는다", async ({ page }) => {
    // Arrange
    await openScreen(page, TODOS_PATH, getTab(page, TODOS_PATH));
    await tapTab(page, RECORDS_PATH);
    const requests = collectScreenRequests(page, TODOS_PATH);

    // Act
    await tapTab(page, TODOS_PATH);

    // Assert: 다시 받는 응답이 올 만큼 기다린다
    await page.waitForTimeout(1_500);
    expect(requests).toHaveLength(0);
  });

  test("상대가 더한 항목은 받은 지 30초가 지나 탭으로 돌아가면 보인다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 탭 30초 뒤", testInfo);
    await page.clock.install();
    await openScreen(page, TODOS_PATH, getTab(page, TODOS_PATH));
    await tapTab(page, RECORDS_PATH);
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content });
    try {
      // Act
      await page.clock.fastForward(31_000);
      await tapTab(page, TODOS_PATH);

      // Assert
      await expect(getTodoText(page, content)).toBeVisible();
    } finally {
      await deleteTodo();
    }
  });

  test("한 탭에서 저장하면 30초가 안 돼도 다른 탭이 저장 전 화면을 보여 주지 않는다", async ({ page }, testInfo) => {
    // Arrange: 홈의 하고 싶은 것 카드에 보이는 항목을 Todo 탭에서 완료한다
    const content = createTestName("E2E 탭 저장 뒤", testInfo);
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content, sortOrder: TOP_SORT_ORDER });
    try {
      await openScreen(page, HOME_PATH, getTodoText(page, content));
      await tapTab(page, TODOS_PATH);
      const saved = page.waitForResponse((response) => response.url().includes("/rest/v1/todos") && response.request().method() === "PATCH");
      await page.getByRole("checkbox", { name: `${content} 완료` }).locator("visible=true").tap();
      await saved;
      // 저장 뒤 목록을 다시 받을 때까지 기다린다
      await page.waitForLoadState("networkidle");

      // Act
      await tapTab(page, HOME_PATH);

      // Assert
      await expect(getTodoText(page, content)).toHaveCount(0);
    } finally {
      await deleteTodo();
    }
  });
});
