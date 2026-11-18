import { randomUUID } from "node:crypto";
import type { Locator, Page, Request, TestInfo } from "@playwright/test";
import { CALENDAR_PATH, formatMonthTitle, shiftMonth } from "@/lib/calendar/month";
import { toKstDate } from "@/lib/anniversary";
import { isScreenRequest, returnToApp } from "./support/actions";
import { createTestName } from "./support/names";
import { createDisposableEvent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 다른 테스트가 쓰지 않는 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 일정이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2018-07" : "2018-03");

const EVENTS_REQUEST = "**/rest/v1/events?*";
// Supabase 조회는 끊긴 요청을 1·2·4초 뒤 세 번 더 시도한 뒤에야 실패를 알린다
const FAILED_AFTER_RETRIES_MS = 15_000;

const getMonthTitle = (page: Page, month: string): Locator =>
  page.getByRole("heading", { name: formatMonthTitle(month), exact: true }).locator("visible=true");
const getEventText = (page: Page, title: string): Locator => page.locator("main").locator("visible=true").getByText(title, { exact: true });
// 날 칸의 이름은 "11월 18일 수요일, ..."처럼 날짜 머리글로 시작한다
const getDayButton = (page: Page, date: string): Locator =>
  page.locator("main table button").locator("visible=true").filter({ hasText: new RegExp(`^${Number(date.slice(8))}$`) }).and(page.getByRole("button", { name: new RegExp(`^${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 `) }));
const getNavLink = (page: Page, name: "이전 달" | "다음 달"): Locator => page.getByRole("link", { name }).locator("visible=true");

/** 캘린더 화면을 서버에 다시 묻는 요청을 모은다 */
const collectScreenRequests = (page: Page): Request[] => {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (isScreenRequest(request, CALENDAR_PATH)) requests.push(request);
  });
  return requests;
};

test.describe("캘린더 달 넘기기(#348)", () => {
  test("다음 달을 누르면 화면을 서버에 다시 묻지 않고 그 달 칸과 일정을 보여 주며 주소도 바뀐다", async ({ page }, testInfo) => {
    // Arrange: 넘어갈 달의 1일(처음 고르는 날)에 일정을 둔다
    const month = getMonth(testInfo);
    const nextMonth = shiftMonth(month, 1);
    const title = createTestName("E2E 달 넘기기", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date: `${nextMonth}-01` });
    try {
      await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
      const requests = collectScreenRequests(page);

      // Act
      await getNavLink(page, "다음 달").tap();

      // Assert
      await expect(getMonthTitle(page, nextMonth)).toBeVisible();
      await expect(getEventText(page, title)).toBeVisible();
      expect(new URL(page.url()).searchParams.get("month")).toBe(nextMonth);
      await page.waitForTimeout(1_000);
      expect(requests).toHaveLength(0);
    } finally {
      await deleteEvent();
    }
  });

  test("앞뒤 달은 미리 받아 두어, 넘긴 뒤 일정을 다시 받지 않아도 보인다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    const previousMonth = shiftMonth(month, -1);
    const title = createTestName("E2E 앞 달 미리 받기", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date: `${previousMonth}-01` });
    try {
      const prefetched = page.waitForResponse((response) => response.url().includes("/rest/v1/events") && response.ok());
      await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
      await prefetched;
      await page.waitForLoadState("networkidle");
      // 미리 받은 뒤의 일정 요청은 모두 막는다. 화면을 서버에 다시 물어 서버가 읽어 오는 것도 아니어야 한다
      await page.route(EVENTS_REQUEST, (route) => route.abort());
      const requests = collectScreenRequests(page);

      // Act
      await getNavLink(page, "이전 달").tap();

      // Assert
      await expect(getMonthTitle(page, previousMonth)).toBeVisible();
      await expect(getEventText(page, title)).toBeVisible();
      expect(requests).toHaveLength(0);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await deleteEvent();
    }
  });

  test("넘긴 달에서 일정을 열었다가 뒤로 돌아오면 넘긴 달을 그대로 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    const nextMonth = shiftMonth(month, 1);
    const title = createTestName("E2E 넘긴 달 돌아오기", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date: `${nextMonth}-01` });
    try {
      await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
      await getNavLink(page, "다음 달").tap();
      await getEventText(page, title).tap();
      await page.waitForURL((url) => url.pathname.startsWith("/events/"));

      // Act
      await page.goBack();

      // Assert
      await expect(getMonthTitle(page, nextMonth)).toBeVisible();
      await expect(getEventText(page, title)).toBeVisible();
    } finally {
      await deleteEvent();
    }
  });

  test("다른 달에서 날을 골랐다가 오늘을 누르면 오늘을 고른다", async ({ page }) => {
    // Arrange: 이번 달에서 오늘이 아닌 날을 고른 뒤 다음 달로 넘긴다
    const today = toKstDate(new Date());
    const otherDay = today.endsWith("-01") ? `${today.slice(0, 8)}02` : `${today.slice(0, 8)}01`;
    await openScreen(page, CALENDAR_PATH, getMonthTitle(page, today.slice(0, 7)));
    await getDayButton(page, otherDay).tap();
    await getNavLink(page, "다음 달").tap();
    await expect(getMonthTitle(page, shiftMonth(today.slice(0, 7), 1))).toBeVisible();

    // Act
    await page.getByRole("link", { name: "오늘", exact: true }).locator("visible=true").tap();

    // Assert
    await expect(getDayButton(page, today)).toHaveAttribute("aria-pressed", "true");
  });

  test("넘긴 달에서 고른 날은 화면을 새로 받아도 그대로이고, 그사이 더해진 일정이 보인다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    const nextMonth = shiftMonth(month, 1);
    const pickedDay = `${nextMonth}-15`;
    const title = createTestName("E2E 넘긴 달 새로 받기", testInfo);
    await page.clock.install();
    await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
    await getNavLink(page, "다음 달").tap();
    await getDayButton(page, pickedDay).tap();
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date: pickedDay });
    try {
      // Act: 30분 넘게 지나 앱으로 돌아오면 화면을 새로 받는다(AppReturn)
      await page.clock.fastForward(31 * 60_000);
      await returnToApp(page);

      // Assert
      await expect(getEventText(page, title)).toBeVisible();
      await expect(getMonthTitle(page, nextMonth)).toBeVisible();
      await expect(getDayButton(page, pickedDay)).toHaveAttribute("aria-pressed", "true");
    } finally {
      await deleteEvent();
    }
  });

  test("일정을 받지 못하면 칸은 그대로 두고 알리며, 다시 시도하면 일정이 보인다", async ({ page }, testInfo) => {
    // Arrange: 브라우저가 받는 일정 요청(미리 받기 포함)을 처음부터 막는다
    const month = getMonth(testInfo);
    const nextMonth = shiftMonth(month, 1);
    const title = createTestName("E2E 달 다시 시도", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date: `${nextMonth}-01` });
    await page.route(EVENTS_REQUEST, (route) => route.abort());
    try {
      await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));

      // Act
      await getNavLink(page, "다음 달").tap();
      await expect(page.getByText("일정을 불러오지 못했어요").locator("visible=true")).toBeVisible({ timeout: FAILED_AFTER_RETRIES_MS });
      await expect(getMonthTitle(page, nextMonth)).toBeVisible();
      await expect(page.locator("main table button").locator("visible=true")).not.toHaveCount(0);
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await page.getByRole("button", { name: "다시 시도" }).locator("visible=true").tap();

      // Assert
      await expect(getEventText(page, title)).toBeVisible();
      await expect(page.getByText("일정을 불러오지 못했어요").locator("visible=true")).toHaveCount(0);
    } finally {
      await page.unrouteAll({ behavior: "ignoreErrors" });
      await deleteEvent();
    }
  });
});
