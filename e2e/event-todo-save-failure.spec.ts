import type { Page } from "@playwright/test";
import { toKstDate } from "@/lib/anniversary";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { TODOS_PATH } from "@/lib/todos/list";
import { deleteEventsByTitle, deleteTodosByContent, getEventIdsByTitle, getTodoIdsByContent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getSubmitButton } from "./support/actions";
import { createTestName } from "./support/names";

// 일정·하고 싶은 것 저장이 실패하는 경우를 모은 스펙(#161). 기록은 record-save-failure.spec.ts에 있다

const EVENTS_URL = "**/rest/v1/events*";
const TODOS_URL = "**/rest/v1/todos*";
const RESPONSE_LOST_MESSAGE = "저장됐는지 확인하지 못했어요";

const getFormAlert = (page: Page) => page.locator("main").getByRole("alert").locator("visible=true");

const getEventTitleField = (page: Page) => page.locator("#event-title").locator("visible=true");

const getTodoContentField = (page: Page) => page.locator("#todo-content").locator("visible=true");

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

// 오늘이면 나란히 도는 홈 테스트의 "다가오는 일정" 자리를 차지하므로 지난날로 둔다
const getYesterday = (): string => toKstDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

const openNewEventForm = async (page: Page, title: string): Promise<void> => {
  await openScreen(page, `/events/new?date=${getYesterday()}`, getEventTitleField(page));
  await getEventTitleField(page).fill(title);
};

test.describe("새 일정을 저장하는데 응답만 끊기면", () => {
  test("한 번만 끊기면 알아서 다시 보내 일정이 하나만 생긴다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("응답 한 번 끊긴 일정", testInfo);
    await openNewEventForm(page, title);
    await loseResponses(page, EVENTS_URL, 1);

    try {
      // Act
      await getSubmitButton(page).tap();
      await page.waitForURL(`**${CALENDAR_PATH}*`);

      // Assert
      expect(await getEventIdsByTitle(title)).toHaveLength(1);
    } finally {
      await deleteEventsByTitle(title);
    }
  });

  test("계속 끊겨 다시 저장해도 일정이 하나만 남고 마지막에 고친 내용이 저장된다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("응답 끊긴 일정", testInfo);
    const fixedTitle = `${title} 고침`;
    await openNewEventForm(page, title);
    await loseResponses(page, EVENTS_URL);

    try {
      // Act
      await getSubmitButton(page).tap();
      await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);
      const [savedId] = await getEventIdsByTitle(title);
      expect(savedId).toBeDefined();

      await page.unroute(EVENTS_URL);
      await getEventTitleField(page).fill(fixedTitle);
      await getSubmitButton(page).tap();
      await page.waitForURL(`**${CALENDAR_PATH}*`);

      // Assert
      expect(await getEventIdsByTitle(title)).toEqual([]);
      expect(await getEventIdsByTitle(fixedTitle)).toEqual([savedId]);
    } finally {
      await deleteEventsByTitle(title);
      await deleteEventsByTitle(fixedTitle);
    }
  });
});

test("응답이 끊겼다는 안내가 나와도 일정 추가 폼의 저장 버튼이 화면 안에 다 보인다", async ({ page, viewport }, testInfo) => {
  // Arrange: 일정 폼은 높이 여유가 거의 없다(#57). 한 줄 안내는 아래 safe-area 안으로 밀려 버튼이 다 보이지만, 두 줄이면 잘린다
  const title = createTestName("안내 높이", testInfo);
  await openNewEventForm(page, title);
  await loseResponses(page, EVENTS_URL);

  try {
    // Act
    await getSubmitButton(page).tap();
    await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);

    // Assert
    const button = await getSubmitButton(page).boundingBox();
    expect((button?.y ?? 0) + (button?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
  } finally {
    await deleteEventsByTitle(title);
  }
});

test("새 일정 저장이 실패한 뒤 제목을 지워 처음 상태로 되돌리면 경고 없이 나간다", async ({ page }, testInfo) => {
  // Arrange: 다시 저장할 때 쓸 id는 남지만 쓴 내용이 아니다
  const title = createTestName("되돌린 일정", testInfo);
  await openNewEventForm(page, title);
  await page.route(EVENTS_URL, (route) => (route.request().method() === "GET" ? route.continue() : route.fulfill({ status: 400, json: { code: "23514", message: "E2E 거절" } })));
  await getSubmitButton(page).tap();
  await expect(getFormAlert(page)).toBeVisible();

  try {
    // Act
    await getEventTitleField(page).fill("");
    await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();

    // Assert
    await page.waitForURL(`**${CALENDAR_PATH}*`);
    await expect(page.getByRole("dialog", { name: "쓰던 내용을 버리고 나갈까요?" })).toHaveCount(0);
  } finally {
    await deleteEventsByTitle(title);
  }
});

test.describe("새 하고 싶은 것을 저장하는데 응답만 끊기면", () => {
  test("다시 저장해도 항목이 하나만 남고 마지막에 고친 내용이 저장된다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("응답 끊긴 항목", testInfo);
    const fixedContent = `${content} 고침`;
    await openScreen(page, "/todos/new", getTodoContentField(page));
    await getTodoContentField(page).fill(content);
    await loseResponses(page, TODOS_URL);

    try {
      // Act
      await getSubmitButton(page).tap();
      await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);
      const [savedId] = await getTodoIdsByContent(content);
      expect(savedId).toBeDefined();

      await page.unroute(TODOS_URL);
      await getTodoContentField(page).fill(fixedContent);
      await getSubmitButton(page).tap();
      await page.waitForURL(`**${TODOS_PATH}`);

      // Assert
      expect(await getTodoIdsByContent(content)).toEqual([]);
      expect(await getTodoIdsByContent(fixedContent)).toEqual([savedId]);
    } finally {
      await deleteTodosByContent(content);
      await deleteTodosByContent(fixedContent);
    }
  });
});
