import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { getSubmitButton } from "./support/actions";
import { MODAL_OPEN_GUARD_WAIT_MS } from "./support/constants";
import { pickDate } from "./support/date-picker";
import { createTestName } from "./support/names";
import { createDisposableEvent, createDisposableTodo, deleteEventById, getTodoEventId, linkTodoEvent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 일정 폼에서 하고 싶은 것 잇기(#472): "하고 싶은 것과 잇기" → 고르는 창에서 하나 고르기 → 저장할 때 잇는다. 끊기도 저장할 때 반영한다.
// 일정 하나에 여러 개를 잇는다(#495): 이은 것은 한 줄에 하나씩, 그 아래 "하나 더 잇기"

// 다른 테스트가 쓰지 않는 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 일정이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2041-06" : "2041-05");

const getMain = (page: Page): Locator => page.locator("main").locator("visible=true");

const openEventEdit = async (page: Page, eventId: string): Promise<void> => {
  await openScreen(page, `/events/${eventId}/edit`, page.locator("#event-title").locator("visible=true"));
};

const getLinkedList = (page: Page): Locator => getMain(page).getByRole("list", { name: "하고 싶은 것", exact: true });

const pickTodo = async (page: Page, content: string, buttonName = "하고 싶은 것과 잇기"): Promise<void> => {
  await getMain(page).getByRole("button", { name: buttonName }).tap();
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
      await expect(getLinkedList(page)).toContainText(content);
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
      await expect(getLinkedList(page)).toContainText(content);

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

  test("여러 개 이은 일정에서 하나를 끊고 하나 더 이어 저장하면 그대로 바뀌고, 남긴 것은 이어진 채다(#495)", async ({ page }, testInfo) => {
    // Arrange
    const [keptId, removedId, addedId, eventId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const kept = createTestName("E2E 남길 것", testInfo);
    const removed = createTestName("E2E 끊을 것", testInfo);
    const added = createTestName("E2E 더 이을 것", testInfo);
    const deleteTodos = await Promise.all([
      createDisposableTodo({ id: keptId, content: kept }),
      createDisposableTodo({ id: removedId, content: removed }),
      createDisposableTodo({ id: addedId, content: added }),
    ]);
    const deleteEvent = await createDisposableEvent({ id: eventId, title: kept, date: `${getMonth(testInfo)}-21` });
    try {
      await linkTodoEvent(keptId, eventId);
      await linkTodoEvent(removedId, eventId);
      await openEventEdit(page, eventId);
      const main = getMain(page);
      await expect(getLinkedList(page).getByRole("listitem")).toHaveCount(2);

      // Act
      await main.getByRole("button", { name: `${removed} 연결 끊기` }).tap();
      await pickTodo(page, added, "하나 더 잇기");
      await expect(getLinkedList(page).getByRole("listitem")).toHaveCount(2);
      await getSubmitButton(page).tap();

      // Assert
      await expect.poll(() => getTodoEventId(addedId)).toBe(eventId);
      expect(await getTodoEventId(removedId)).toBeUndefined();
      expect(await getTodoEventId(keptId)).toBe(eventId);
    } finally {
      await deleteEvent();
      for (const deleteTodo of deleteTodos) await deleteTodo();
    }
  });

  test("고르는 창의 줄에 키보드 초점을 두면 초점 테두리가 목록 안에 그려져 창 양끝에서 잘리지 않는다(#506)", async ({ page }, testInfo) => {
    // Arrange: 줄이 창 양끝까지 닿고 목록은 스크롤 영역이라, 바깥에 그린 초점 테두리는 잘린다
    const deleteTodos = await Promise.all(
      [1, 2].map((index) => createDisposableTodo({ id: randomUUID(), content: createTestName(`E2E 초점 줄 ${index}`, testInfo) })),
    );
    try {
      await openScreen(page, "/events/new", page.locator("#event-title").locator("visible=true"));
      await getMain(page).getByRole("button", { name: "하고 싶은 것과 잇기" }).tap();
      const list = page.getByRole("dialog", { name: "어느 하고 싶은 것과 이을까요?" }).getByRole("list", { name: "이을 하고 싶은 것" });
      await list.waitFor();

      // Act: 둘째 줄에서 Shift+Tab으로 첫 줄로 옮겨, 키보드로 둔 초점(초점 테두리가 보이는 상태)으로 만든다
      await list.getByRole("button").nth(1).focus();
      await page.keyboard.press("Shift+Tab");
      await expect(list.getByRole("button").first()).toBeFocused();

      // Assert
      const room = await list.evaluate((listElement) => {
        const row = document.activeElement;
        if (!(row instanceof HTMLElement) || !listElement.contains(row) || !row.matches(":focus-visible")) return undefined;
        const style = getComputedStyle(row);
        if (style.outlineStyle === "none") return undefined;
        const grow = Number.parseFloat(style.outlineOffset) + Number.parseFloat(style.outlineWidth);
        const rowBox = row.getBoundingClientRect();
        const listBox = listElement.getBoundingClientRect();
        return { left: rowBox.left - grow - listBox.left, right: listBox.right - (rowBox.right + grow) };
      });
      expect(room).toBeDefined();
      expect(room?.left).toBeGreaterThanOrEqual(0);
      expect(room?.right).toBeGreaterThanOrEqual(0);
    } finally {
      await Promise.all(deleteTodos.map((deleteTodo) => deleteTodo()));
    }
  });

  test("새 일정 폼에서 하고 싶은 것 둘을 이어 저장하면 둘 다 그 일정에 이어진다(#495)", async ({ page }, testInfo) => {
    // Arrange
    const [firstId, secondId] = [randomUUID(), randomUUID()];
    const first = createTestName("E2E 새 일정 첫째", testInfo);
    const second = createTestName("E2E 새 일정 둘째", testInfo);
    const deleteTodos = await Promise.all([createDisposableTodo({ id: firstId, content: first }), createDisposableTodo({ id: secondId, content: second })]);
    let eventId: string | undefined;
    try {
      await openScreen(page, "/events/new", page.locator("#event-title").locator("visible=true"));
      await page.locator("#event-title").locator("visible=true").fill(createTestName("E2E 둘 이은 일정", testInfo));
      await pickDate(page, "#event-date", `${getMonth(testInfo)}-22`);

      // Act
      await pickTodo(page, first);
      await pickTodo(page, second, "하나 더 잇기");
      await getSubmitButton(page).tap();

      // Assert
      await expect.poll(() => getTodoEventId(firstId)).toBeDefined();
      eventId = await getTodoEventId(firstId);
      expect(await getTodoEventId(secondId)).toBe(eventId);
    } finally {
      if (eventId) await deleteEventById(eventId);
      for (const deleteTodo of deleteTodos) await deleteTodo();
    }
  });
});
