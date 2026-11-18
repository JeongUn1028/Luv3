import { randomUUID } from "node:crypto";
import type { CDPSession, Locator, Page, Request, TestInfo } from "@playwright/test";
import { CALENDAR_PATH, formatDayHeading } from "@/lib/calendar/month";
import { getCalendarEventRow, isScreenRequest } from "./support/actions";
import { createTestName } from "./support/names";
import { createDisposableEvent, createDisposableRepeatingEvent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 다른 테스트가 쓰지 않는 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 일정이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2013-10" : "2013-06");

const getSheet = (page: Page): Locator => page.getByRole("dialog");

const openDay = async (page: Page, date: string, title: string): Promise<void> => {
  await openScreen(page, `${CALENDAR_PATH}?month=${date.slice(0, 7)}&date=${date}`, getCalendarEventRow(page, title));
};

/** 캘린더 화면을 서버에 다시 묻는 요청을 모은다 */
const collectScreenRequests = (page: Page): Request[] => {
  const requests: Request[] = [];
  page.on("request", (request) => {
    if (isScreenRequest(request, CALENDAR_PATH)) requests.push(request);
  });
  return requests;
};

// 한 손가락으로 끄는 몸짓은 Chrome 개발자 도구 명령으로 보낸다. 실제 터치처럼 touch-action도 따른다
const dragDown = async (page: Page, from: { x: number; y: number }, distance: number): Promise<void> => {
  const session: CDPSession = await page.context().newCDPSession(page);
  const send = (type: "touchStart" | "touchMove" | "touchEnd", y?: number) =>
    session.send("Input.dispatchTouchEvent", { type, touchPoints: y === undefined ? [] : [{ x: from.x, y, id: 0 }] });
  await send("touchStart", from.y);
  for (let step = 1; step <= 8; step += 1) {
    await page.waitForTimeout(40);
    await send("touchMove", from.y + (distance * step) / 8);
  }
  await send("touchEnd");
  await session.detach();
};

test.describe("일정 읽기 창(#352)", () => {
  test("일정 줄을 누르면 화면을 옮기지 않고 아래 창에 언제·장소·쓴 사람·메모를 쓴 그대로 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const date = `${getMonth(testInfo)}-11`;
    const title = createTestName("E2E 읽기 창", testInfo);
    const memo = "준비물: 양말\n2층 B룸";
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date, memo, place: "강남역 3번 출구", startTime: "19:00", isTogether: false });
    try {
      await openDay(page, date, title);
      const url = page.url();
      const requests = collectScreenRequests(page);

      // Act
      await getCalendarEventRow(page, title).tap();

      // Assert
      const sheet = getSheet(page);
      await expect(sheet.getByRole("heading", { name: title })).toBeVisible();
      await expect(sheet).toContainText(`${formatDayHeading(date)} 19:00`);
      await expect(sheet).toContainText("강남역 3번 출구");
      await expect(sheet.getByRole("img", { name: /일정$/ })).toBeVisible();
      await expect(sheet.getByText("준비물: 양말", { exact: false })).toHaveText(memo, { useInnerText: true });
      await expect(sheet.getByRole("link", { name: "기록 남기기" })).toHaveCount(0);
      expect(page.url()).toBe(url);
      expect(requests).toHaveLength(0);
    } finally {
      await deleteEvent();
    }
  });

  test("고치기를 누르면 그날을 담은 고치기 화면이 열린다", async ({ page }, testInfo) => {
    // Arrange: 2013-06-05·10-02는 수요일이다. 다음 주에서 연다
    const start = testInfo.project.name === "iphone-17" ? "2013-10-02" : "2013-06-05";
    const date = testInfo.project.name === "iphone-17" ? "2013-10-09" : "2013-06-12";
    const id = randomUUID();
    const title = createTestName("E2E 읽기 창 반복", testInfo);
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: start, repeatRule: "weekly", memo: "매주 메모" });
    try {
      await openDay(page, date, title);
      await getCalendarEventRow(page, title).tap();
      await expect(getSheet(page)).toContainText("매주");
      await expect(getSheet(page)).toContainText("매주 메모");

      // Act
      await getSheet(page).getByRole("link", { name: "고치기" }).tap();

      // Assert
      await page.waitForURL(`**/events/${id}/edit?date=${date}`);
      await expect(page.locator("#event-title").locator("visible=true")).toHaveValue(title);
    } finally {
      await deleteEvent();
    }
  });

  test("지난 함께 일정은 창에서도 기록을 남길 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const date = `${getMonth(testInfo)}-13`;
    const title = createTestName("E2E 읽기 창 기록", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date });
    try {
      await openDay(page, date, title);

      // Act
      await getCalendarEventRow(page, title).tap();

      // Assert
      await expect(getSheet(page).getByRole("link", { name: "기록 남기기" })).toBeVisible();
    } finally {
      await deleteEvent();
    }
  });

  test("닫기나 창 바깥을 누르면 닫힌다", async ({ page }, testInfo) => {
    // Arrange
    const date = `${getMonth(testInfo)}-14`;
    const title = createTestName("E2E 읽기 창 닫기", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date });
    try {
      await openDay(page, date, title);
      const row = getCalendarEventRow(page, title);

      // Act & Assert: 닫기
      await row.tap();
      await getSheet(page).getByRole("button", { name: "닫기" }).tap();
      await expect(getSheet(page)).toHaveCount(0);

      // Act & Assert: 바깥(화면 맨 위)
      await row.tap();
      await expect(getSheet(page)).toBeVisible();
      await page.touchscreen.tap(200, 40);
      await expect(getSheet(page)).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });

  test("머리글을 충분히 끌어내리면 닫히고, 조금만 내리면 그대로 있다", async ({ page }, testInfo) => {
    // Arrange
    const date = `${getMonth(testInfo)}-17`;
    const title = createTestName("E2E 읽기 창 끌기", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date });
    try {
      await openDay(page, date, title);
      await getCalendarEventRow(page, title).tap();
      const heading = getSheet(page).getByRole("heading", { name: title });
      const box = await heading.boundingBox();
      if (!box) throw new Error("창 제목이 화면에 없습니다");
      const handle = { x: box.x + 20, y: box.y + box.height / 2 };

      // Act & Assert: 조금(40px) 천천히 내리면 그대로
      await dragDown(page, handle, 40);
      await page.waitForTimeout(400);
      await expect(getSheet(page)).toBeVisible();

      // Act & Assert: 충분히(200px) 내리면 닫힌다
      await dragDown(page, handle, 200);
      await expect(getSheet(page)).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });

  test("메모가 길면 창이 화면을 넘지 않고 창 안에서 스크롤되며, 고치기 버튼까지 내려갈 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const date = `${getMonth(testInfo)}-18`;
    const title = createTestName("E2E 읽기 창 긴 메모", testInfo);
    const memo = Array.from({ length: 60 }, (_, index) => `${index + 1}번째 줄 메모`).join("\n");
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date, memo });
    try {
      await openDay(page, date, title);

      // Act
      await getCalendarEventRow(page, title).tap();

      // Assert
      const sheet = getSheet(page);
      await expect(sheet).toBeVisible();
      const viewport = page.viewportSize();
      const box = await sheet.boundingBox();
      if (!viewport || !box) throw new Error("창이 화면에 없습니다");
      expect(box.y).toBeGreaterThan(0);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
      const edit = sheet.getByRole("link", { name: "고치기" });
      await edit.scrollIntoViewIfNeeded();
      await expect(edit).toBeInViewport();
      // 머리글(제목·닫기)은 스크롤해도 위에 남는다
      await expect(sheet.getByRole("button", { name: "닫기" })).toBeInViewport();
    } finally {
      await deleteEvent();
    }
  });
});
