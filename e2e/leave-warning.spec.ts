import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { pickPhoto } from "./support/actions";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

const getBackButton = (page: Page): Locator => page.getByRole("link", { name: "뒤로" }).locator("visible=true");
const getLeaveDialog = (page: Page): Locator => page.getByRole("dialog", { name: "쓰던 내용을 버리고 나갈까요?" });
const getTodoContent = (page: Page): Locator => page.locator("#todo-content").locator("visible=true");

/** 뒤로 버튼을 누르고, 경고 없이 폼을 떠났는지 본다 */
const expectLeavesWithoutWarning = async (page: Page, formPath: string): Promise<void> => {
  await getBackButton(page).tap();
  await page.waitForURL((url) => url.pathname !== formPath);
  await expect(getLeaveDialog(page)).toHaveCount(0);
};

test.describe("쓰던 내용을 잃기 전 경고", () => {
  test("하고 싶은 것을 쓰다가 뒤로 버튼을 누르면 경고 창을 띄우고, 계속 쓰기를 고르면 쓴 내용이 남는다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/todos/new", getTodoContent(page));
    await getTodoContent(page).fill("쓰던 하고 싶은 것");

    // Act
    await getBackButton(page).tap();

    // Assert
    await expect(getLeaveDialog(page)).toBeVisible();
    await getLeaveDialog(page).getByRole("button", { name: "계속 쓰기" }).tap();
    await expect(getLeaveDialog(page)).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/todos/new");
    await expect(getTodoContent(page)).toHaveValue("쓰던 하고 싶은 것");
  });

  test("경고 창에서 나가기를 고르면 목록으로 돌아간다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/todos/new", getTodoContent(page));
    await getTodoContent(page).fill("버릴 하고 싶은 것");
    await getBackButton(page).tap();

    // Act
    await getLeaveDialog(page).getByRole("button", { name: "나가기" }).tap();

    // Assert
    await page.waitForURL(`**${TODOS_PATH}`);
    await expect(getLeaveDialog(page)).toHaveCount(0);
  });

  test("일정과 기록도 내용을 바꾸면 경고 창을 띄운다", async ({ page }) => {
    await openScreen(page, "/events/new", page.locator("#event-title").locator("visible=true"));
    await page.locator("#event-title").locator("visible=true").fill("쓰던 일정");
    await getBackButton(page).tap();
    await expect(getLeaveDialog(page)).toBeVisible();

    // 사진만 골라도 쓴 내용이다
    await openScreen(page, "/dates/new", page.locator("#memo").locator("visible=true"));
    await pickPhoto(page, 1);
    await getBackButton(page).tap();
    await expect(getLeaveDialog(page)).toBeVisible();
  });

  for (const { path, ready } of [
    { path: "/todos/new", ready: "#todo-content" },
    { path: "/events/new", ready: "#event-title" },
    { path: "/dates/new", ready: "#memo" },
  ]) {
    test(`${path} 폼은 바꾸지 않았으면 경고 없이 돌아간다`, async ({ page }) => {
      await openScreen(page, path, page.locator(ready).locator("visible=true"));

      await expectLeavesWithoutWarning(page, path);
    });
  }

  test("고치는 폼에서 바꿨다가 처음 내용으로 되돌리면 경고 없이 돌아간다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("E2E 되돌린 항목", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });
    try {
      await openScreen(page, `/todos/${id}/edit`, getTodoContent(page));
      await getTodoContent(page).fill(`${content} 고침`);
      await getTodoContent(page).fill(content);

      // Act & Assert
      await expectLeavesWithoutWarning(page, `/todos/${id}/edit`);
    } finally {
      await deleteTodo();
    }
  });
});
