import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { getVisibleLink, pickPhoto } from "./support/actions";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

const getBackButton = (page: Page): Locator => page.getByRole("link", { name: "뒤로" }).locator("visible=true");
const getLeaveDialog = (page: Page): Locator => page.getByRole("dialog", { name: "쓰던 내용을 버리고 나갈까요?" });
const getTodoContent = (page: Page): Locator => page.locator("#todo-content").locator("visible=true");

const NEW_RECORD_PATH = "/dates/new";

/**
 * 목록 화면에서 새로 쓰기 폼을 연다. 다시 열 때(`isOpen`)는 이미 목록에 있으므로 링크만 누른다.
 * 같은 링크로 열어야 숨겨 둔 폼(Activity)이 다시 보인다
 */
const openNewForm = async (page: Page, listPath: string, formPath: string, { isOpen = false } = {}): Promise<void> => {
  if (!isOpen) await openScreen(page, listPath, getVisibleLink(page, formPath));
  await getVisibleLink(page, formPath).tap();
  await page.waitForURL(`**${formPath}`);
};

/** 뒤로 버튼을 누르고 경고 창에서 나가기를 골라 목록으로 돌아간다 */
const leaveDiscarding = async (page: Page, listPath: string): Promise<void> => {
  await getBackButton(page).tap();
  await getLeaveDialog(page).getByRole("button", { name: "나가기" }).tap();
  await page.waitForURL(`**${listPath}`);
};

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

  // 경고 창은 "사라져요"라고 알리므로 다시 열면 비어 있어야 한다(#284). 일정·Todo 새 폼은 열 때마다 새 key로 만들어져 지금도 비어 있다.
  // 기록 폼처럼 숨겨 둔 폼을 다시 보여 주게 바뀌어도 이 약속이 지켜지는지 지키는 회귀 테스트다
  for (const { listPath, formPath, field } of [
    { listPath: TODOS_PATH, formPath: `${TODOS_PATH}/new`, field: "#todo-content" },
    { listPath: CALENDAR_PATH, formPath: "/events/new", field: "#event-title" },
  ]) {
    test(`${formPath} 폼에서 나가기를 고른 뒤 다시 열면 쓴 내용이 지워져 있다`, async ({ page }) => {
      // Arrange
      await openNewForm(page, listPath, formPath);
      await page.locator(field).locator("visible=true").fill("버릴 내용");

      // Act
      await leaveDiscarding(page, listPath);
      await openNewForm(page, listPath, formPath, { isOpen: true });

      // Assert
      await expect(page.locator(field).locator("visible=true")).toHaveValue("");
    });
  }

  // 기록 새 폼은 그냥 열면 숨겨 둔 폼을 다시 보여 주므로(뒤로 가기로 나가면 쓴 내용이 남는다, photo-preview-return), 나가기를 고르면 지워야 한다
  test("기록 폼에서 나가기를 고른 뒤 다시 열면 고른 사진과 쓴 내용이 지워져 있다", async ({ page }) => {
    // Arrange
    await openNewForm(page, RECORDS_PATH, NEW_RECORD_PATH);
    await pickPhoto(page, 1);
    await page.locator("#title").locator("visible=true").fill("버릴 기록");

    // Act
    await leaveDiscarding(page, RECORDS_PATH);
    await openNewForm(page, RECORDS_PATH, NEW_RECORD_PATH, { isOpen: true });

    // Assert
    await expect(page.locator("#title").locator("visible=true")).toHaveValue("");
    await expect(page.getByRole("button", { name: "1번째 사진 빼기" }).locator("visible=true")).toHaveCount(0);
    // 다시 쓰다 나가도 묻는다(버린 뒤에도 처음 내용과 견준다)
    await page.locator("#title").locator("visible=true").fill("다시 쓴 기록");
    await getBackButton(page).tap();
    await expect(getLeaveDialog(page)).toBeVisible();
  });

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
