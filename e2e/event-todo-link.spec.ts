import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { getSubmitButton } from "./support/actions";
import { MODAL_OPEN_GUARD_WAIT_MS } from "./support/constants";
import { pickDate } from "./support/date-picker";
import { createTestName } from "./support/names";
import { createDisposableEvent, createDisposableTodo, deleteEventById, getTodoEventId, linkTodoEvent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 일정 폼에서 하고 싶은 것 잇기(#472): "하고 싶은 것과 잇기" → 고르는 창에서 하나 고르기 → 저장할 때 잇는다. 끊기도 저장할 때 반영한다

// 다른 테스트가 쓰지 않는 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 일정이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2041-06" : "2041-05");

const getMain = (page: Page): Locator => page.locator("main").locator("visible=true");

const openEventEdit = async (page: Page, eventId: string): Promise<void> => {
  await openScreen(page, `/events/${eventId}/edit`, page.locator("#event-title").locator("visible=true"));
};

const pickTodo = async (page: Page, content: string): Promise<void> => {
  await getMain(page).getByRole("button", { name: "하고 싶은 것과 잇기" }).tap();
  const dialog = page.getByRole("dialog", { name: "어느 하고 싶은 것과 이을까요?" });
  await dialog.waitFor();
  await page.waitForTimeout(MODAL_OPEN_GUARD_WAIT_MS);
  await dialog.getByRole("list", { name: "이을 하고 싶은 것" }).getByRole("button", { name: content, exact: true }).tap();
  await expect(dialog).toHaveCount(0);
};

test.describe("일정 폼에서 하고 싶은 것 잇기(#472)", () => {
  test("새 일정 폼에서 하고 싶은 것을 고르고 저장하면 이어져, 하고 싶은 것 목록의 그 줄에 날짜 칩이 붙는다", async ({ page }, testInfo) => {
    // Arrange
    const todoId = randomUUID();
    const content = createTestName("E2E 폼에서 잇기", testInfo);
    const title = createTestName("E2E 폼에서 이은 일정", testInfo);
    const deleteTodo = await createDisposableTodo({ id: todoId, content });
    try {
      await openScreen(page, "/events/new", page.locator("#event-title").locator("visible=true"));
      await page.locator("#event-title").locator("visible=true").fill(title);
      await pickDate(page, "#event-date", `${getMonth(testInfo)}-07`);

      // Act
      await pickTodo(page, content);
      await expect(getMain(page).getByRole("group", { name: "하고 싶은 것" })).toContainText(content);
      await getSubmitButton(page).tap();

      // Assert: 일정 제목은 그대로 두고 잇는다
      await expect.poll(() => getTodoEventId(todoId)).toBeDefined();
      await openScreen(page, TODOS_PATH, getMain(page).locator("li").filter({ hasText: content }));
      await expect(getMain(page).locator("li").filter({ hasText: content })).toContainText(`${Number(getMonth(testInfo).slice(5))}월 7일`);
      const eventId = await getTodoEventId(todoId);
      if (eventId) await deleteEventById(eventId);
    } finally {
      await deleteTodo();
    }
  });

  test("반복을 고르면 하고 싶은 것 칸이 사라지고, 하고 싶은 것을 고르면 반복 칸이 사라진다", async ({ page }, testInfo) => {
    // Arrange
    const todoId = randomUUID();
    const content = createTestName("E2E 반복과 잇기", testInfo);
    const deleteTodo = await createDisposableTodo({ id: todoId, content });
    try {
      await openScreen(page, "/events/new", page.locator("#event-title").locator("visible=true"));
      const main = getMain(page);

      // Act
      await pickTodo(page, content);

      // Assert
      await expect(page.locator("#event-repeat")).toHaveCount(0);

      // Act: 끊으면 반복 칸이 돌아오고, 반복을 고르면 하고 싶은 것 칸이 사라진다
      await main.getByRole("button", { name: `${content} 연결 끊기` }).tap();
      await page.locator("#event-repeat").locator("visible=true").selectOption("weekly");

      // Assert
      await expect(main.getByRole("button", { name: "하고 싶은 것과 잇기" })).toHaveCount(0);
    } finally {
      await deleteTodo();
    }
  });

  test("이어진 일정을 고칠 때 연결 끊기를 누르고 저장하면 연결만 풀리고, 다시 열어 고르면 이어진다", async ({ page }, testInfo) => {
    // Arrange
    const todoId = randomUUID();
    const eventId = randomUUID();
    const content = createTestName("E2E 고치기에서 끊기", testInfo);
    const deleteTodo = await createDisposableTodo({ id: todoId, content });
    const deleteEvent = await createDisposableEvent({ id: eventId, title: content, date: `${getMonth(testInfo)}-14` });
    try {
      await linkTodoEvent(todoId, eventId);
      await openEventEdit(page, eventId);
      const main = getMain(page);
      await expect(main.getByRole("group", { name: "하고 싶은 것" })).toContainText(content);

      // Act: 끊고 저장
      await main.getByRole("button", { name: `${content} 연결 끊기` }).tap();
      await getSubmitButton(page).tap();

      // Assert
      await expect.poll(() => getTodoEventId(todoId)).toBeUndefined();

      // Act: 다시 열어 고르고 저장
      await openEventEdit(page, eventId);
      await pickTodo(page, content);
      await getSubmitButton(page).tap();

      // Assert
      await expect.poll(() => getTodoEventId(todoId)).toBe(eventId);
    } finally {
      await deleteEvent();
      await deleteTodo();
    }
  });
});
