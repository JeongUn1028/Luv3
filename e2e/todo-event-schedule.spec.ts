import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { toKstDate } from "@/lib/anniversary";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { formatTodoEventChip } from "@/lib/todos/event-chip";
import { TODOS_PATH } from "@/lib/todos/list";
import { toTodoEditHref } from "@/lib/todos/schedule";
import { getCalendarEventRow, getSubmitButton } from "./support/actions";
import { pickDate } from "./support/date-picker";
import { createTestName } from "./support/names";
import { createDisposableEvent, createDisposableTodo, deleteEventById, getTodoEventId, linkTodoEvent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 하고 싶은 것에 일정 잡기(#471): 고치기 화면의 "일정 잡기" → 새 일정 폼 → 저장하면 이어지고 칩이 붙는다

// 다른 테스트가 쓰지 않는 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 일정이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2041-04" : "2041-03");

const getMain = (page: Page): Locator => page.locator("main").locator("visible=true");

const openTodoEdit = async (page: Page, todoId: string): Promise<void> => {
  await openScreen(page, toTodoEditHref(todoId), page.locator("#todo-content").locator("visible=true"));
};

const getListRow = (page: Page, content: string): Locator => page.locator("main li").filter({ hasText: content }).locator("visible=true");

test.describe("하고 싶은 것에 일정 잡기(#471)", () => {
  test("고치기 화면에서 일정을 잡으면 제목·함께를 채운 폼이 열리고, 저장하면 목록의 그 줄에 날짜 칩이 붙고 고치기 화면에 일정 보기가 보인다", async ({ page }, testInfo) => {
    // Arrange
    const todoId = randomUUID();
    const content = createTestName("E2E 일정 잡기", testInfo);
    const date = `${getMonth(testInfo)}-12`;
    const deleteTodo = await createDisposableTodo({ id: todoId, content });
    try {
      await openTodoEdit(page, todoId);

      // Act: 일정 잡기 → 날짜만 고르고 저장
      await getMain(page).getByRole("link", { name: "일정 잡기" }).tap();
      await page.waitForURL(`**/events/new?todo=${todoId}`);
      const main = getMain(page);
      await expect(main.getByText(`하고 싶은 것 ${content}에 이어요`)).toBeVisible();
      await expect(page.locator("#event-title").locator("visible=true")).toHaveValue(content);
      await expect(main.getByRole("radio", { name: "함께" })).toBeChecked();
      await expect(page.locator("#event-repeat")).toHaveCount(0);
      await pickDate(page, "#event-date", date);
      await getSubmitButton(page).tap();

      // Assert: 목록으로 돌아와 그 줄을 표시하고, 저장이 끝나면 날짜 칩이 붙는다
      await page.waitForURL(`**${TODOS_PATH}`);
      const chipLabel = formatTodoEventChip({ id: "", date, endDate: undefined, isTogether: true, authorNickname: undefined }, toKstDate(new Date())).label;
      const row = getListRow(page, content);
      await expect(row).toHaveClass(/todo-just-added/);
      await expect(row).toContainText(chipLabel);
      const eventId = await getTodoEventId(todoId);
      expect(eventId).toBeDefined();

      // 고치기 화면은 날짜와 "일정 보기"로 바뀐다
      await openTodoEdit(page, todoId);
      await expect(getMain(page).getByText(chipLabel)).toBeVisible();
      await expect(getMain(page).getByRole("link", { name: "일정 보기" })).toBeVisible();
      if (eventId) await deleteEventById(eventId);
    } finally {
      await deleteTodo();
    }
  });

  test("이어진 일정은 고칠 때도 반복 칸이 없고, 일정을 지우면 연결만 풀려 다시 일정 잡기가 보인다", async ({ page }, testInfo) => {
    // Arrange
    const todoId = randomUUID();
    const eventId = randomUUID();
    const content = createTestName("E2E 이어진 일정", testInfo);
    const deleteTodo = await createDisposableTodo({ id: todoId, content });
    const deleteEvent = await createDisposableEvent({ id: eventId, title: content, date: `${getMonth(testInfo)}-15` });
    try {
      await linkTodoEvent(todoId, eventId);

      // Act
      await openScreen(page, `/events/${eventId}/edit`, page.locator("#event-title").locator("visible=true"));

      // Assert
      await expect(page.locator("#event-repeat")).toHaveCount(0);

      // Act: 상대가 일정을 지운 뒤 고치기 화면을 연다
      await deleteEvent();
      await openTodoEdit(page, todoId);

      // Assert
      await expect(getMain(page).getByRole("link", { name: "일정 잡기" })).toBeVisible();
      expect(await getTodoEventId(todoId)).toBeUndefined();
    } finally {
      await deleteEvent().catch(() => undefined);
      await deleteTodo();
    }
  });

  test("캘린더 일정 읽기 창에 이어진 하고 싶은 것이 보이고, 누르면 목록의 그 줄로 가서 표시한다", async ({ page }, testInfo) => {
    // Arrange
    const todoId = randomUUID();
    const eventId = randomUUID();
    const content = createTestName("E2E 읽기 창 하고 싶은 것", testInfo);
    const title = createTestName("E2E 읽기 창 일정", testInfo);
    const date = `${getMonth(testInfo)}-20`;
    const deleteTodo = await createDisposableTodo({ id: todoId, content });
    const deleteEvent = await createDisposableEvent({ id: eventId, title, date });
    try {
      await linkTodoEvent(todoId, eventId);
      await openScreen(page, `${CALENDAR_PATH}?month=${date.slice(0, 7)}&date=${date}`, getCalendarEventRow(page, title));
      await getCalendarEventRow(page, title).tap();
      const sheet = page.getByRole("dialog");

      // Act
      await sheet.getByRole("link", { name: content }).tap();

      // Assert
      await page.waitForURL(`**${TODOS_PATH}`);
      const row = getListRow(page, content);
      await expect(row).toBeInViewport();
      await expect(row).toHaveClass(/todo-just-added/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
    } finally {
      await deleteEvent();
      await deleteTodo();
    }
  });
});
