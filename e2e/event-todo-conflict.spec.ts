import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { TODOS_PATH } from "@/lib/todos/list";
import {
  completeAndMoveTodo,
  createDisposableEvent,
  createDisposableRepeatingEvent,
  createDisposableTodo,
  getDetachedEventIds,
  getEventExceptionDates,
  getEventIdsByTitle,
  getTodoContent,
  renameEvent,
  renameTodo,
} from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getSubmitButton } from "./support/actions";
import { createTestName } from "./support/names";

// 고치기 화면을 연 사이 상대가 같은 일정·하고 싶은 것을 고친 경우를 모은 스펙(#161). 기록은 record-save-failure.spec.ts에 있다

const EVENTS_URL = "**/rest/v1/events*";
const TODOS_URL = "**/rest/v1/todos*";
const DETACH_URL = "**/rest/v1/rpc/detach_event_occurrence";
const RESPONSE_LOST_MESSAGE = "저장됐는지 확인하지 못했어요";
const EVENT_CONFLICT_MESSAGE = "그사이 바뀌어 저장 못 했어요";
const TODO_CONFLICT_MESSAGE = "그사이 이 항목이 바뀌어 저장하지 않았어요";

const getFormAlert = (page: Page) => page.locator("main").getByRole("alert").locator("visible=true");

const getEventTitleField = (page: Page) => page.locator("#event-title").locator("visible=true");

const getTodoContentField = (page: Page) => page.locator("#todo-content").locator("visible=true");

const getReloadButton = (page: Page) => page.getByRole("button", { name: "최신 내용 불러오기" }).locator("visible=true");

/**
 * 서버는 저장 요청을 처리했지만 응답이 앱까지 오지 못한 상황을 만든다.
 * `times`를 주면 그 횟수만 끊고, 다음 요청부터는 그대로 보낸다.
 */
const loseResponses = async (page: Page, url: string, times = Number.POSITIVE_INFINITY): Promise<void> => {
  let lostCount = 0;
  await page.route(url, async (route) => {
    if (route.request().method() === "GET" || lostCount >= times) return route.continue();
    lostCount += 1;
    await route.fetch();
    await route.abort("connectionreset");
  });
};

test.describe("일정 고치기 화면을 연 사이 상대가 일정을 고치면", () => {
  test("저장을 거부해 상대의 내용을 덮지 않고, 최신 내용을 불러와 다시 고칠 수 있다", async ({ page, viewport }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("상대가 고친 일정", testInfo);
    const partnerTitle = `${title} 상대`;
    const deleteEvent = await createDisposableEvent({ id, title, date: "2045-03-08" });

    try {
      await openScreen(page, `/events/${id}/edit`, getEventTitleField(page));
      await renameEvent(id, partnerTitle);
      await getEventTitleField(page).fill(`${title} 내 수정`);

      // Act
      await getSubmitButton(page).tap();

      // Assert: 저장하지 않고 쓰던 내용을 둔다. 일정 폼은 높이 여유가 없어(#57) 불러오기 버튼이 화면 안에 다 보이는지도 본다
      await expect(getFormAlert(page)).toContainText(EVENT_CONFLICT_MESSAGE);
      await expect(getEventTitleField(page)).toHaveValue(`${title} 내 수정`);
      expect(await getEventIdsByTitle(partnerTitle)).toEqual([id]);
      const button = await getReloadButton(page).boundingBox();
      expect((button?.y ?? 0) + (button?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);

      // Act: 최신 내용을 불러와 다시 고친다
      await getReloadButton(page).tap();
      await expect(getEventTitleField(page)).toHaveValue(partnerTitle);
      await getEventTitleField(page).fill(`${title} 다시 고침`);
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      expect(await getEventIdsByTitle(`${title} 다시 고침`)).toEqual([id]);
    } finally {
      await deleteEvent();
    }
  });

  test("이 날만 고칠 때 상대가 반복 일정을 고쳤으면 그날을 떼어 내지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("상대가 고친 반복", testInfo);
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2045-04-05", repeatRule: "weekly" });

    try {
      await openScreen(page, `/events/${id}/edit?date=2045-04-19`, getEventTitleField(page));
      await expect(page.getByRole("radio", { name: "이 날만" })).toBeChecked();
      await renameEvent(id, `${title} 상대`);
      await getEventTitleField(page).fill(`${title} 그날만`);

      // Act
      await getSubmitButton(page).tap();

      // Assert
      await expect(getFormAlert(page)).toContainText(EVENT_CONFLICT_MESSAGE);
      await expect(getReloadButton(page)).toBeVisible();
      expect(await getEventExceptionDates(id)).toEqual([]);
      expect(await getDetachedEventIds(id)).toEqual([]);
    } finally {
      await deleteEvent();
    }
  });
});

test.describe("일정을 고치다 응답만 끊기면", () => {
  test("이 날만 고칠 때 한 번 끊기면 알아서 다시 보내 그날 일정이 하나만 생긴다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("응답 끊긴 이 날만", testInfo);
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2045-05-03", repeatRule: "weekly" });

    try {
      await openScreen(page, `/events/${id}/edit?date=2045-05-17`, getEventTitleField(page));
      await getEventTitleField(page).fill(`${title} 그날만`);
      await loseResponses(page, DETACH_URL, 1);

      // Act
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      expect(await getDetachedEventIds(id)).toHaveLength(1);
      expect(await getEventExceptionDates(id)).toEqual(["2045-05-17"]);
    } finally {
      await deleteEvent();
    }
  });

  test("이 날만 고칠 때 계속 끊겨 제목을 고쳐 다시 저장하면 고친 제목으로 그날 일정이 하나만 남는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("계속 끊긴 이 날만", testInfo);
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2045-07-05", repeatRule: "weekly" });

    try {
      await openScreen(page, `/events/${id}/edit?date=2045-07-19`, getEventTitleField(page));
      await getEventTitleField(page).fill(`${title} 1`);
      await loseResponses(page, DETACH_URL);
      await getSubmitButton(page).tap();
      await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);

      // Act
      await page.unroute(DETACH_URL);
      await getEventTitleField(page).fill(`${title} 2`);
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      const detachedIds = await getDetachedEventIds(id);
      expect(detachedIds).toHaveLength(1);
      expect(await getEventIdsByTitle(`${title} 2`)).toEqual(detachedIds);
    } finally {
      await deleteEvent();
    }
  });

  test("다시 고쳐 저장하면 내 앞선 저장을 상대의 저장으로 오해하지 않는다", async ({ page }, testInfo) => {
    // Arrange: 첫 저장은 서버가 처리했지만 응답이 오지 않아 판 번호가 바뀐 것을 화면이 모른다
    const id = randomUUID();
    const title = createTestName("응답 끊긴 일정 고치기", testInfo);
    const deleteEvent = await createDisposableEvent({ id, title, date: "2045-06-07" });

    try {
      await openScreen(page, `/events/${id}/edit`, getEventTitleField(page));
      await getEventTitleField(page).fill(`${title} 1`);
      await loseResponses(page, EVENTS_URL);
      await getSubmitButton(page).tap();
      await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);
      expect(await getEventIdsByTitle(`${title} 1`)).toEqual([id]);

      // Act
      await page.unroute(EVENTS_URL);
      await getEventTitleField(page).fill(`${title} 2`);
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      expect(await getEventIdsByTitle(`${title} 2`)).toEqual([id]);
    } finally {
      await deleteEvent();
    }
  });
});

test.describe("하고 싶은 것 고치기 화면을 연 사이", () => {
  test("상대가 내용을 고치면 저장을 거부하고, 최신 내용을 불러와 다시 고칠 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("상대가 고친 항목", testInfo);
    const partnerContent = `${content} 상대`;
    const deleteTodo = await createDisposableTodo({ id, content });

    try {
      await openScreen(page, `/todos/${id}/edit`, getTodoContentField(page));
      await renameTodo(id, partnerContent);
      await getTodoContentField(page).fill(`${content} 내 수정`);

      // Act
      await getSubmitButton(page).tap();

      // Assert
      await expect(getFormAlert(page)).toContainText(TODO_CONFLICT_MESSAGE);
      await expect(getTodoContentField(page)).toHaveValue(`${content} 내 수정`);
      expect(await getTodoContent(id)).toBe(partnerContent);

      // Act: 최신 내용을 불러와 다시 고친다
      await getReloadButton(page).tap();
      await expect(getTodoContentField(page)).toHaveValue(partnerContent);
      await getTodoContentField(page).fill(`${content} 다시 고침`);
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${TODOS_PATH}`);
      expect(await getTodoContent(id)).toBe(`${content} 다시 고침`);
    } finally {
      await deleteTodo();
    }
  });

  test("상대가 해냄으로 표시하거나 순서만 옮겼으면 내 수정을 저장한다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("상대가 해낸 항목", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });

    try {
      await openScreen(page, `/todos/${id}/edit`, getTodoContentField(page));
      await completeAndMoveTodo(id);
      await getTodoContentField(page).fill(`${content} 내 수정`);

      // Act
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${TODOS_PATH}`);
      expect(await getTodoContent(id)).toBe(`${content} 내 수정`);
    } finally {
      await deleteTodo();
    }
  });

  test("응답이 끊긴 뒤 다시 고쳐 저장하면 내 앞선 저장을 상대의 저장으로 오해하지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("응답 끊긴 항목 고치기", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });

    try {
      await openScreen(page, `/todos/${id}/edit`, getTodoContentField(page));
      await getTodoContentField(page).fill(`${content} 1`);
      await loseResponses(page, TODOS_URL);
      await getSubmitButton(page).tap();
      await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);
      expect(await getTodoContent(id)).toBe(`${content} 1`);

      // Act
      await page.unroute(TODOS_URL);
      await getTodoContentField(page).fill(`${content} 2`);
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${TODOS_PATH}`);
      expect(await getTodoContent(id)).toBe(`${content} 2`);
    } finally {
      await deleteTodo();
    }
  });
});
