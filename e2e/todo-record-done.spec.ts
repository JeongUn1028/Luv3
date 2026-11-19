import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { MODAL_OPEN_GUARD_WAIT_MS } from "./support/constants";
import { createTestName } from "./support/names";
import { createDisposableEvent, createDisposableRecord, createDisposableTodo, isTodoCompleted, linkTodoEvent, uncompleteTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 기록 남기면 하고 싶은 것 완료(#473): 하고 싶은 것에 이어진 일정과 기록이 이어지면 저절로 완료하고, 완료 줄에 "기록 보기"를 둔다

// 다른 테스트가 쓰지 않는 지난 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 기록이 후보로 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2019-08" : "2019-07");

const getMain = (page: Page): Locator => page.locator("main").locator("visible=true");

test.describe("기록 남기면 하고 싶은 것 완료(#473)", () => {
  test("기록 상세에서 하고 싶은 것에 이어진 일정과 이으면 그 하고 싶은 것이 완료 칸으로 옮겨지고, 기록 보기로 그 기록에 간다", async ({ page }, testInfo) => {
    // Arrange: 하고 싶은 것에 이어진 지난 함께 일정과, 그날 이미 쓴 기록
    const date = `${getMonth(testInfo)}-10`;
    const todoId = randomUUID();
    const eventId = randomUUID();
    const recordId = randomUUID();
    const content = createTestName("E2E 기록 완료", testInfo);
    const title = createTestName("E2E 기록 완료 일정", testInfo);
    const deleteTodo = await createDisposableTodo({ id: todoId, content });
    const deleteEvent = await createDisposableEvent({ id: eventId, title, date });
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 기록 완료 기록", testInfo), date });
    try {
      await linkTodoEvent(todoId, eventId);
      const linkButton = page.getByRole("button", { name: "일정과 잇기", exact: true }).locator("visible=true");
      await openScreen(page, `/dates/${recordId}`, linkButton);

      // Act: 일정과 잇기
      await linkButton.tap();
      const dialog = page.getByRole("dialog").locator("visible=true");
      await dialog.waitFor();
      await page.waitForTimeout(MODAL_OPEN_GUARD_WAIT_MS);
      await dialog.getByRole("button", { name: `${title} 일정과 잇기` }).tap();

      // Assert: 묻지 않고 완료된다
      await expect.poll(() => isTodoCompleted(todoId)).toBe(true);

      // Act: 하고 싶은 것 목록의 완료 줄에서 기록 보기
      const recordLink = getMain(page).getByRole("link", { name: `${content} 기록 보기` });
      await openScreen(page, TODOS_PATH, recordLink);
      await expect(getMain(page).getByRole("checkbox", { name: `${content} 완료` })).toBeChecked();
      await recordLink.tap();

      // Assert
      await page.waitForURL(`**/dates/${recordId}`);
    } finally {
      await deleteRecord();
      await deleteEvent();
      await deleteTodo();
    }
  });

  test("기록이 남은 일정의 하고 싶은 것은 완료를 손으로 풀어도 날짜가 지났다고 다시 묻지 않는다", async ({ page }, testInfo) => {
    // Arrange: 기록을 남겨 저절로 완료된 뒤 완료를 푼다
    const date = `${getMonth(testInfo)}-20`;
    const todoId = randomUUID();
    const eventId = randomUUID();
    const content = createTestName("E2E 기록 뒤 완료 풀기", testInfo);
    const deleteTodo = await createDisposableTodo({ id: todoId, content });
    const deleteEvent = await createDisposableEvent({ id: eventId, title: content, date });
    try {
      await linkTodoEvent(todoId, eventId);
      const deleteRecord = await createDisposableRecord({ id: randomUUID(), title: content, date, eventLink: { eventId, eventDate: date } });
      try {
        await expect.poll(() => isTodoCompleted(todoId)).toBe(true);
        await uncompleteTodo(todoId);

        // Act
        const checkbox = getMain(page).getByRole("checkbox", { name: `${content} 완료` });
        await openScreen(page, TODOS_PATH, checkbox);

        // Assert
        await expect(checkbox).not.toBeChecked();
        await expect(getMain(page).getByRole("group", { name: `${content}, 다녀오셨나요? 완료로 옮길까요?` })).toHaveCount(0);
      } finally {
        await deleteRecord();
      }
    } finally {
      await deleteEvent();
      await deleteTodo();
    }
  });

  test("기록이 이어진 일정이 없는 완료 줄에는 기록 보기가 없다", async ({ page }, testInfo) => {
    // Arrange
    const todoId = randomUUID();
    const content = createTestName("E2E 손으로 완료", testInfo);
    const deleteTodo = await createDisposableTodo({ id: todoId, content, completedAt: new Date().toISOString() });
    try {
      // Act
      await openScreen(page, TODOS_PATH, getMain(page).getByRole("checkbox", { name: `${content} 완료` }));

      // Assert
      await expect(getMain(page).getByRole("link", { name: `${content} 기록 보기` })).toHaveCount(0);
    } finally {
      await deleteTodo();
    }
  });
});
