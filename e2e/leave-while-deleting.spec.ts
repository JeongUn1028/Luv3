import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { createDisposableEvent, createDisposableRecord, createDisposableTodo, getRecordIdsByTitle } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getCalendarEventRow, getCouplePhoto, getTab, openEventEditFromCalendar } from "./support/actions";
import { createTestName } from "./support/names";

// 지우는 사이 화면을 벗어났을 때(#261). 기록·하고 싶은 것·일정은 확인하면 바로 목록으로 돌아가고(#346), 그 뒤 다른 화면으로 옮긴다.
// 커플 사진은 아이폰 가장자리 밀기(뒤로 가기)로 벗어난다.
// 성공·실패 모두 알리고, 지금 보는 화면을 목록으로 바꾸지 않는다

/** 나란히 도는 다른 테스트의 달력·홈과 겹치지 않는 지난 날짜 */
const PAST_EVENT_DATE = "2020-04-15";

const getNotice = (page: Page, role: "status" | "alert", name: string): Locator =>
  page.getByRole(role).filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "닫기" }) });

const getDeleteButton = (page: Page): Locator => page.getByRole("button", { name: "지우기", exact: true }).locator("visible=true");

const confirmDelete = async (page: Page): Promise<void> => {
  await getDeleteButton(page).tap();
  await page.getByRole("dialog").getByRole("button", { name: "지우기", exact: true }).tap();
};

const failRequest = (route: Route) => route.fulfill({ status: 500, json: { message: "E2E 삭제 실패" } });

/** 지우는 요청을 붙들어, 화면을 벗어난 뒤에 끝나게 한다 */
const holdRequest = async (page: Page, { url, method, finish }: { url: string; method: string; finish: (route: Route) => Promise<void> }) => {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markRequested = (): void => undefined;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(url, async (route) => {
    if (route.request().method() !== method) return route.continue();
    markRequested();
    await released;
    return finish(route);
  });
  return { requested, release };
};

const holdRecordDelete = (page: Page, finish: (route: Route) => Promise<void>) =>
  holdRequest(page, { url: "**/rest/v1/dates*", method: "DELETE", finish });

/** 기록 목록에서 상세로 옮겨 온다. 화면 안에서 옮겨야 뒤로 가기가 숨겨 둔 목록으로 돌아간다 */
const openRecordFromList = async (page: Page, id: string, title: string): Promise<void> => {
  const link = page.locator("main").locator("visible=true").getByRole("link", { name: title });
  await openScreen(page, RECORDS_PATH, link);
  await link.tap();
  await page.waitForURL(`**/dates/${id}`);
};

test.describe("지우는 사이 화면을 벗어나면", () => {
  test("기록 삭제가 끝나도 보던 화면에 남고, 지웠다고 알리며, 목록에서도 사라진다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 나가도 삭제", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });
    try {
      await openRecordFromList(page, id, title);
      const request = await holdRecordDelete(page, (route) => route.continue());
      await confirmDelete(page);
      await request.requested;
      await page.waitForURL(`**${RECORDS_PATH}`);

      // Act: 바로 돌아간 목록에서 다른 탭으로 옮긴다
      await getTab(page, TODOS_PATH).tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      request.release();

      // Assert
      await expect(getNotice(page, "status", "기록을 지웠어요")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(TODOS_PATH);

      await getTab(page, RECORDS_PATH).tap();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: title })).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("기록 삭제에 실패하면 닫을 때까지 알리고, 돌아가면 기록이 남아 있으며 다시 지울 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 나가서 삭제 실패", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });
    try {
      await openRecordFromList(page, id, title);
      const request = await holdRecordDelete(page, failRequest);
      await confirmDelete(page);
      await request.requested;
      await page.waitForURL(`**${RECORDS_PATH}`);

      // Act
      request.release();

      // Assert: 알림이 저절로 사라지지 않는다
      const notice = getNotice(page, "alert", "기록을 지우지 못했어요");
      await expect(notice).toBeVisible();
      await page.waitForTimeout(5_000);
      await expect(notice).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(RECORDS_PATH);

      await notice.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/dates/${id}`);
      await expect(notice).toHaveCount(0);
      await expect(page.getByRole("heading", { name: title }).locator("visible=true")).toBeVisible();

      // Act: 다시 지운다
      await page.unrouteAll({ behavior: "wait" });
      await getDeleteButton(page).tap();
      const dialog = page.getByRole("dialog", { name: "이 기록을 지울까요?" });
      // 지난 실패 문구가 창에 남거나 "지우는 중"에 멈춰 있지 않다
      await expect(dialog.getByText("지우지 못했어요")).toHaveCount(0);
      await dialog.getByRole("button", { name: "지우기", exact: true }).tap();

      // Assert
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: title })).toHaveCount(0);
      await expect.poll(() => getRecordIdsByTitle(title)).toEqual([]);
      await expect(getNotice(page, "status", "기록을 지웠어요")).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("바로 돌아간 뒤 끝나기 전에 앞으로 가기로 다시 와도 실패를 알린다(확인 창은 돌아갈 때 닫혔다)", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 돌아와서 삭제 실패", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });
    try {
      await openRecordFromList(page, id, title);
      const request = await holdRecordDelete(page, failRequest);
      await confirmDelete(page);
      await request.requested;

      // Act: 확인하면 바로 목록으로 돌아가고(#346), 앞으로 가기로 기록에 다시 온다
      await page.waitForURL(`**${RECORDS_PATH}`);
      await page.goForward();
      await page.waitForURL(`**/dates/${id}`);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      request.release();

      // Assert: 이미 그 화면에 있으니 돌아갈 링크는 없다
      const notice = getNotice(page, "alert", "기록을 지우지 못했어요");
      await expect(notice).toBeVisible();
      await expect(notice.getByRole("link", { name: "돌아가기" })).toHaveCount(0);
      expect(new URL(page.url()).pathname).toBe(`/dates/${id}`);
    } finally {
      await deleteRecord();
    }
  });

  test("바로 돌아간 뒤 실패가 먼저 끝나고 앞으로 가기로 다시 와도 실패 알림이 남는다", async ({ page }, testInfo) => {
    // Arrange: 느린 기기처럼 기록 화면이 다시 보이기 전에 실패가 끝나는 순서를 만든다(#394)
    const id = randomUUID();
    const title = createTestName("E2E 실패 먼저 돌아옴", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });
    try {
      await openRecordFromList(page, id, title);
      const request = await holdRecordDelete(page, failRequest);
      await confirmDelete(page);
      await request.requested;
      await page.waitForURL(`**${RECORDS_PATH}`);
      request.release();
      const notice = getNotice(page, "alert", "기록을 지우지 못했어요");
      await expect(notice.getByRole("link", { name: "돌아가기" })).toBeVisible();

      // Act
      await page.goForward();
      await page.waitForURL(`**/dates/${id}`);
      await expect(page.getByRole("heading", { name: title }).locator("visible=true")).toBeVisible();

      // Assert: 이미 그 화면에 있으니 돌아갈 링크 없이 남는다
      await expect(notice).toBeVisible();
      await expect(notice.getByRole("link", { name: "돌아가기" })).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("하고 싶은 것 삭제가 끝나도 옮겨 간 화면을 목록으로 바꾸지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("E2E 나가도 지울 항목", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });
    try {
      const link = page.locator("main").locator("visible=true").getByRole("link", { name: content });
      await openScreen(page, TODOS_PATH, link);
      await link.tap();
      await page.waitForURL(`**/todos/${id}/edit`);
      const request = await holdRequest(page, { url: "**/rest/v1/todos*", method: "DELETE", finish: (route) => route.continue() });
      await confirmDelete(page);
      await request.requested;

      // Act: 바로 돌아간 목록에서 다른 탭으로 옮긴다
      await page.waitForURL(`**${TODOS_PATH}`);
      await getTab(page, CALENDAR_PATH).tap();
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      request.release();

      // Assert
      await expect(getNotice(page, "status", "하고 싶은 것을 지웠어요")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(CALENDAR_PATH);
      await page.goBack();
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: content })).toHaveCount(0);
    } finally {
      await deleteTodo();
    }
  });

  test("일정 삭제에 실패하면 알리고, 알림에서 일정 고치기 화면으로 돌아갈 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 나가서 일정 삭제 실패", testInfo);
    const deleteEvent = await createDisposableEvent({ id, title, date: PAST_EVENT_DATE });
    try {
      const calendarHref = `${CALENDAR_PATH}?month=${PAST_EVENT_DATE.slice(0, 7)}&date=${PAST_EVENT_DATE}`;
      const row = getCalendarEventRow(page, title);
      await openScreen(page, calendarHref, row);
      await openEventEditFromCalendar(page, row);
      await page.waitForURL(`**/events/${id}/edit*`);
      const request = await holdRequest(page, { url: "**/rest/v1/events*", method: "DELETE", finish: failRequest });
      await confirmDelete(page);
      await request.requested;

      await page.waitForURL(`**${CALENDAR_PATH}*`);

      // Act
      request.release();

      // Assert: 숨겼던 줄도 돌아온다
      const notice = getNotice(page, "alert", "일정을 지우지 못했어요");
      await expect(notice).toBeVisible();
      await expect(row.locator("visible=true")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(CALENDAR_PATH);
      await notice.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/events/${id}/edit*`);
      await expect(page.locator("#event-title").locator("visible=true")).toHaveValue(title);
      await expect(notice).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });
});

test.describe("커플 사진을 지우는 사이 홈을 벗어나면", () => {
  // 커플 사진은 두 사람이 함께 쓰므로 실제로 지우지 않는다. 비우는 요청만 붙들어 성공·실패 응답을 대신 돌려준다
  const holdClear = (page: Page, finish: (route: Route) => Promise<void>) =>
    holdRequest(page, { url: "**/rest/v1/rpc/clear_couple_photo", method: "POST", finish });

  const startClearAndLeave = async (page: Page, finish: (route: Route) => Promise<void>): Promise<() => void> => {
    // 기록 목록에서 홈으로 옮겨 와야 뒤로 갈 곳이 생긴다
    await openScreen(page, RECORDS_PATH, getTab(page, "/"));
    await getTab(page, "/").tap();
    await page.waitForURL((url) => url.pathname === "/");
    const request = await holdClear(page, finish);
    await page.getByRole("button", { name: "커플 사진 바꾸기" }).tap();
    await page.getByRole("button", { name: "사진 지우기" }).tap();
    await page.getByRole("dialog", { name: "커플 사진을 지울까요?" }).getByRole("button", { name: "지우기" }).tap();
    await request.requested;
    await page.goBack();
    await page.waitForURL(`**${RECORDS_PATH}`);
    return request.release;
  };

  test("지우기가 끝나면 지웠다고 알리고 보던 화면에 남는다", async ({ page }) => {
    // Arrange & Act
    const release = await startClearAndLeave(page, (route) => route.fulfill({ status: 200, json: null }));
    release();

    // Assert
    await expect(getNotice(page, "status", "커플 사진을 지웠어요")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(RECORDS_PATH);
  });

  test("지우지 못하면 닫을 때까지 알리고, 돌아가면 사진이 그대로 있다", async ({ page }) => {
    // Arrange & Act
    const release = await startClearAndLeave(page, failRequest);
    release();

    // Assert
    const notice = getNotice(page, "alert", "커플 사진을 지우지 못했어요");
    await expect(notice).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(RECORDS_PATH);
    await notice.getByRole("link", { name: "돌아가기" }).tap();
    await page.waitForURL((url) => url.pathname === "/");
    await expect(notice).toHaveCount(0);
    await expect(getCouplePhoto(page)).toBeVisible();
    // 창 안에 남은 실패 문구도 없다(창은 홈을 떠날 때 닫힌다)
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
