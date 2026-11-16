import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { createDisposableEvent, createDisposableRecord, createDisposableRepeatingEvent, createDisposableTodo, getRecordIdsByTitle } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

// 지우기 확인을 누르면 응답을 기다리지 않고 창을 닫고 돌아가며, 돌아간 화면에서 지운 항목을 바로 숨긴다(#346)

/** 나란히 도는 다른 테스트의 달력·홈과 겹치지 않는 지난 날짜 */
const PAST_EVENT_DATE = "2020-05-13";

const getNotice = (page: Page, role: "status" | "alert", name: string): Locator =>
  page.getByRole(role).filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "닫기" }) });

const getVisibleLink = (page: Page, name: string | RegExp): Locator => page.locator("main").locator("visible=true").getByRole("link", { name });

const getEventRow = (page: Page, title: string): Locator => page.getByRole("link", { name: new RegExp(`^(?!.*기록 (남기기|보기)).*${title}`) }).locator("visible=true");

const confirmDelete = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true").tap();
  await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).tap();
};

const failRequest = (route: Route) => route.fulfill({ status: 500, json: { message: "E2E 삭제 실패" } });

/** 지우는 요청을 붙들어 두었다가 `release`로 끝낸다 */
const holdDelete = async (page: Page, { url, finish = (route) => route.continue() }: { url: string; finish?: (route: Route) => Promise<void> }) => {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markRequested = (): void => undefined;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(url, async (route) => {
    const method = route.request().method();
    if (method !== "DELETE" && method !== "POST") return route.continue();
    markRequested();
    await released;
    return finish(route);
  });
  return { requested, release };
};

test.describe("지우기 확인을 누르면", () => {
  test("하고 싶은 것은 응답 전에 창이 닫히고 목록으로 돌아가 항목이 바로 사라지며, 끝나도 알리지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("E2E 바로 지우기", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });
    const request = await holdDelete(page, { url: "**/rest/v1/todos*" });
    try {
      const link = getVisibleLink(page, content);
      await openScreen(page, TODOS_PATH, link);
      await link.tap();
      await page.waitForURL(`**/todos/${id}/edit`);

      // Act
      await confirmDelete(page);
      await request.requested;

      // Assert: 응답 전인데 목록이고 항목이 없다
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(getVisibleLink(page, content)).toHaveCount(0);

      // Act
      request.release();

      // Assert: 돌아간 목록이 이미 보여 주므로 "지웠어요"는 띄우지 않는다
      await expect.poll(async () => getVisibleLink(page, content).count()).toBe(0);
      await page.waitForTimeout(1_000);
      await expect(getVisibleLink(page, content)).toHaveCount(0);
      await expect(getNotice(page, "status", "하고 싶은 것을 지웠어요")).toHaveCount(0);
    } finally {
      request.release();
      await deleteTodo();
    }
  });

  test("하고 싶은 것을 지우지 못하면 숨긴 항목이 돌아오고, 알림에서 고치기 화면으로 돌아갈 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("E2E 바로 지우기 실패", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });
    const request = await holdDelete(page, { url: "**/rest/v1/todos*", finish: failRequest });
    try {
      const link = getVisibleLink(page, content);
      await openScreen(page, TODOS_PATH, link);
      await link.tap();
      await page.waitForURL(`**/todos/${id}/edit`);
      await confirmDelete(page);
      await request.requested;
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(getVisibleLink(page, content)).toHaveCount(0);

      // Act
      request.release();

      // Assert
      await expect(getVisibleLink(page, content)).toBeVisible();
      const notice = getNotice(page, "alert", "하고 싶은 것을 지우지 못했어요");
      await expect(notice).toBeVisible();
      await notice.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/todos/${id}/edit`);
      await expect(page.locator("#todo-content").locator("visible=true")).toHaveValue(content);
    } finally {
      request.release();
      await deleteTodo();
    }
  });

  test("일정은 응답 전에 캘린더로 돌아가 그 줄이 바로 사라진다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 바로 일정 지우기", testInfo);
    const deleteEvent = await createDisposableEvent({ id, title, date: PAST_EVENT_DATE });
    const request = await holdDelete(page, { url: "**/rest/v1/events*" });
    try {
      const row = getEventRow(page, title);
      await openScreen(page, `${CALENDAR_PATH}?month=${PAST_EVENT_DATE.slice(0, 7)}&date=${PAST_EVENT_DATE}`, row);
      await row.tap();
      await page.waitForURL(`**/events/${id}/edit*`);

      // Act
      await confirmDelete(page);
      await request.requested;

      // Assert
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(getEventRow(page, title)).toHaveCount(0);
      request.release();
      await expect(getNotice(page, "status", "일정을 지웠어요")).toHaveCount(0);
    } finally {
      request.release();
      await deleteEvent();
    }
  });

  test("반복 일정의 이 날만 지우면 응답 전에 그날 줄만 사라지고 다른 날은 남는다", async ({ page }, testInfo) => {
    // Arrange: 2047-05-08과 15일은 수요일이다
    const id = randomUUID();
    const title = createTestName("E2E 바로 하루 지우기", testInfo);
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2047-05-01", repeatRule: "weekly" });
    const request = await holdDelete(page, { url: "**/rest/v1/event_exceptions*" });
    try {
      const row = getEventRow(page, title);
      await openScreen(page, `${CALENDAR_PATH}?month=2047-05&date=2047-05-08`, row);
      await row.tap();
      await page.waitForURL(`**/events/${id}/edit*`);
      await expect(page.getByRole("radio", { name: "이 날만" })).toBeChecked();

      // Act
      await confirmDelete(page);
      await request.requested;

      // Assert
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      await expect(getEventRow(page, title)).toHaveCount(0);
      await page.getByRole("button", { name: /^5월 15일 / }).tap();
      await expect(getEventRow(page, title)).toBeVisible();
    } finally {
      request.release();
      await deleteEvent();
    }
  });

  test("기록은 응답 전에 기록 목록으로 돌아가 그 칸이 바로 사라지고, 끝나도 알리지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 바로 기록 지우기", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });
    const request = await holdDelete(page, { url: "**/rest/v1/dates*" });
    try {
      const link = getVisibleLink(page, title);
      await openScreen(page, RECORDS_PATH, link);
      await link.tap();
      await page.waitForURL(`**/dates/${id}`);

      // Act
      await confirmDelete(page);
      await request.requested;

      // Assert
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expect(getVisibleLink(page, title)).toHaveCount(0);
      request.release();
      await expect.poll(() => getRecordIdsByTitle(title)).toEqual([]);
      await expect(getNotice(page, "status", "기록을 지웠어요")).toHaveCount(0);
    } finally {
      request.release();
      await deleteRecord();
    }
  });

  test("주소로 바로 연 기록도 응답 전에 기록 목록으로 옮겨 그 칸을 숨기고, 지우기 요청은 끊기지 않는다", async ({ page }, testInfo) => {
    // Arrange: 앞 화면이 다른 문서라 뒤로 가지 않고 목록 주소로 옮긴다. 새로 받은 목록에도 아직 기록이 있다
    const id = randomUUID();
    const title = createTestName("E2E 주소로 연 기록 지우기", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });
    const request = await holdDelete(page, { url: "**/rest/v1/dates*" });
    try {
      await openScreen(page, `/dates/${id}`, page.getByRole("heading", { name: title }).locator("visible=true"));

      // Act
      await confirmDelete(page);
      await request.requested;

      // Assert
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(page.locator("main").locator("visible=true").first()).toBeVisible();
      await expect(getVisibleLink(page, title)).toHaveCount(0);
      request.release();
      await expect.poll(() => getRecordIdsByTitle(title)).toEqual([]);
    } finally {
      request.release();
      await deleteRecord();
    }
  });
});
