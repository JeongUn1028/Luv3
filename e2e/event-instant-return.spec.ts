import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { getSubmitButton, openEventEditFromCalendar } from "./support/actions";
import { pickDate } from "./support/date-picker";
import { readAnimations, recordAnimations } from "./support/motion";
import { createDisposableEvent, deleteEventsByTitle } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

// 일정을 저장하면 저장을 기다리지 않고 바로 캘린더로 돌아가고, 하루짜리 일정만 저장 전에 먼저 그린다(#345)

const EVENTS_URL = "**/rest/v1/events*";
// 나란히 도는 다른 테스트와 날이 겹치지 않게 먼 미래의 달을 쓰고, 테스트마다 다른 날을 쓴다
const MONTH = "2037-05";
const toDay = (day: number): string => `${MONTH}-${String(day).padStart(2, "0")}`;

/** 저장 요청을 붙들어 두었다가 `release`로 보낸다. `finish`를 주면 보내는 대신 그 응답을 준다 */
const holdSaveRequest = async (page: Page, finish: (route: Route) => Promise<void> = (route) => route.continue()) => {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markRequested = (): void => undefined;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(EVENTS_URL, async (route) => {
    if (route.request().method() === "GET") return route.continue();
    markRequested();
    await released;
    return finish(route);
  });
  return { requested, release };
};

const getEventRow = (page: Page, title: string): Locator => page.locator("main li").filter({ hasText: title }).locator("visible=true");

/** 캘린더에서 그날을 고른 채 "일정 추가"로 폼을 연다. 뒤로 가기로 돌아갈 캘린더가 기록에 남는다 */
const openNewFormFromCalendar = async (page: Page, date: string): Promise<void> => {
  await openScreen(page, `${CALENDAR_PATH}?month=${date.slice(0, 7)}&date=${date}`, page.locator("main").locator("visible=true").first());
  await page.locator(`main a[href="/events/new?date=${date}"]`).locator("visible=true").tap();
  await page.waitForURL(`**/events/new?date=${date}`);
  await page.locator("#event-title").locator("visible=true").waitFor();
};

const getTitleField = (page: Page): Locator => page.locator("#event-title").locator("visible=true");

test.describe("새 일정을 저장하면", () => {
  test("하루짜리 일정은 저장이 끝나기 전에 캘린더로 돌아가 흐린 줄을 먼저 그리고, 저장이 끝나면 원래 모양이 된다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 바로 돌아가는 일정", testInfo);
    await openNewFormFromCalendar(page, toDay(14));
    await getTitleField(page).fill(title);
    const save = await holdSaveRequest(page);

    try {
      // Act
      await getSubmitButton(page).tap();
      await save.requested;

      // Assert: 저장 응답 전인데 캘린더이고, 그날의 띠와 줄이 먼저 보인다
      await page.waitForURL(`**${CALENDAR_PATH}?*`);
      const row = getEventRow(page, title);
      await expect(row).toContainText("(저장 중)");
      await expect(row.getByRole("button").first()).toHaveAttribute("aria-disabled", "true");
      await expect(page.getByRole("button", { name: /^5월 14일 .*함께 일정 1개/ }).locator("visible=true")).toBeVisible();

      // Act
      save.release();

      // Assert
      await expect(row).not.toContainText("(저장 중)");
      await expect(row.getByRole("button").first()).not.toHaveAttribute("aria-disabled", "true");
      // 돌아간 캘린더가 이미 보여 주므로 "저장했어요" 알림은 띄우지 않는다
      await expect(page.getByRole("status").filter({ hasText: "일정을 저장했어요" })).toHaveCount(0);
    } finally {
      await deleteEventsByTitle(title);
    }
  });

  test("반복 일정은 먼저 그리지 않고, 저장이 끝난 뒤 새로 받아 나타난다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 반복은 나중에", testInfo);
    await openNewFormFromCalendar(page, toDay(15));
    await getTitleField(page).fill(title);
    await page.locator("#event-repeat").locator("visible=true").selectOption("weekly");
    const save = await holdSaveRequest(page);

    try {
      // Act
      await getSubmitButton(page).tap();
      await save.requested;
      await page.waitForURL(`**${CALENDAR_PATH}?*`);

      // Assert
      await expect(getEventRow(page, title)).toHaveCount(0);
      save.release();
      await expect(getEventRow(page, title)).toBeVisible();
      await expect(getEventRow(page, title)).not.toContainText("(저장 중)");
    } finally {
      await deleteEventsByTitle(title);
    }
  });

  test("다른 달 날짜로 저장하면 뒤로 가지 않고 그 달의 그날로 옮긴다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 다른 달 일정", testInfo);
    await openNewFormFromCalendar(page, toDay(16));
    await getTitleField(page).fill(title);
    await pickDate(page, "#event-date", "2037-06-03");
    const save = await holdSaveRequest(page);

    try {
      // Act
      await getSubmitButton(page).tap();
      await save.requested;

      // Assert
      await page.waitForURL(`**${CALENDAR_PATH}?month=2037-06&date=2037-06-03`);
      await expect(getEventRow(page, title)).toContainText("(저장 중)");
      save.release();
      await expect(getEventRow(page, title)).not.toContainText("(저장 중)");
    } finally {
      await deleteEventsByTitle(title);
    }
  });

  test("저장에 실패하면 먼저 그린 줄을 빼고 알리며, 돌아가면 쓴 내용이 남아 있다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 바로 돌아가 실패한 일정", testInfo);
    await openNewFormFromCalendar(page, toDay(17));
    await getTitleField(page).fill(title);
    const save = await holdSaveRequest(page, (route) => route.fulfill({ status: 400, json: { code: "23514", message: "E2E 거절" } }));

    try {
      await getSubmitButton(page).tap();
      await save.requested;
      await page.waitForURL(`**${CALENDAR_PATH}?*`);
      await expect(getEventRow(page, title)).toBeVisible();

      // Act
      save.release();

      // Assert
      const notice = page.getByRole("alert").filter({ hasText: "일정을 저장하지 못했어요" });
      await expect(notice).toBeVisible();
      await expect(getEventRow(page, title)).toHaveCount(0);
      await notice.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/events/new?date=${toDay(17)}`);
      await expect(getTitleField(page)).toHaveValue(title);
    } finally {
      await deleteEventsByTitle(title);
    }
  });
});

test("하루짜리 일정을 고쳐 저장하면 캘린더로 바로 돌아가 고친 내용을 먼저 보여 준다", async ({ page }, testInfo) => {
  // Arrange
  const id = randomUUID();
  const title = createTestName("E2E 고쳐 바로 돌아가는 일정", testInfo);
  const fixedTitle = `${title} 고침`;
  const day = toDay(18);
  const deleteEvent = await createDisposableEvent({ id, title, date: day });
  try {
    await openScreen(page, `${CALENDAR_PATH}?month=${MONTH}&date=${day}`, getEventRow(page, title));
    await openEventEditFromCalendar(page, getEventRow(page, title).getByRole("button").first());
    await page.waitForURL(`**/events/${id}/edit*`);
    await getTitleField(page).fill(fixedTitle);
    const save = await holdSaveRequest(page);

    // Act
    await getSubmitButton(page).tap();
    await save.requested;

    // Assert: 고치기 전 제목 줄은 사라지고 고친 제목이 흐리게 보인다
    await page.waitForURL(`**${CALENDAR_PATH}?*`);
    await expect(getEventRow(page, fixedTitle)).toContainText("(저장 중)");
    await expect(getEventRow(page, title).filter({ hasNotText: "고침" })).toHaveCount(0);
    save.release();
    await expect(getEventRow(page, fixedTitle)).not.toContainText("(저장 중)");
  } finally {
    await deleteEvent();
  }
});

test.describe("움직임", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("일정을 저장하고 돌아갈 때 뒤로 버튼을 누른 것처럼 왼쪽에서 밀려 들어온다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 일정 돌아가는 움직임", testInfo);
    await openNewFormFromCalendar(page, toDay(19));
    await getTitleField(page).fill(title);
    await recordAnimations(page);

    try {
      // Act
      await getSubmitButton(page).tap();
      await page.waitForURL(`**${CALENDAR_PATH}?*`);

      // Assert
      await expect.poll(() => readAnimations(page)).toContain("screen-slide-in");
    } finally {
      await deleteEventsByTitle(title);
    }
  });

  test("다른 달로 옮길 때도 같은 움직임으로 들어온다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 다른 달 움직임", testInfo);
    await openNewFormFromCalendar(page, toDay(20));
    await getTitleField(page).fill(title);
    await pickDate(page, "#event-date", "2037-06-04");
    await recordAnimations(page);

    try {
      // Act
      await getSubmitButton(page).tap();
      await page.waitForURL(`**${CALENDAR_PATH}?month=2037-06*`);

      // Assert
      await expect.poll(() => readAnimations(page)).toContain("screen-slide-in");
    } finally {
      await deleteEventsByTitle(title);
    }
  });
});
