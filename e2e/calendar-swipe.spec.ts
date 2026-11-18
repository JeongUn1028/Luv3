import { randomUUID } from "node:crypto";
import type { CDPSession, Locator, Page, TestInfo } from "@playwright/test";
import { CALENDAR_PATH, formatMonthTitle, shiftMonth } from "@/lib/calendar/month";
import { BACK_GESTURE_EDGE_PX } from "@/lib/calendar/swipe";
import { createTestName } from "./support/names";
import { createDisposableEvent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 다른 테스트가 쓰지 않는 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 일정이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2016-09" : "2016-05");

interface Point {
  x: number;
  y: number;
}

const getMonthTitle = (page: Page, month: string): Locator =>
  page.getByRole("heading", { name: formatMonthTitle(month), exact: true }).locator("visible=true");
const getSwipeArea = (page: Page): Locator => page.getByTestId("calendar-swipe").locator("visible=true");
const getDayButton = (page: Page, date: string): Locator =>
  getSwipeArea(page).getByRole("button", { name: new RegExp(`^${Number(date.slice(5, 7))}월 ${Number(date.slice(8))}일 `) });

const getCenter = async (locator: Locator): Promise<Point> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("달력 칸이 화면에 없습니다");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

// Playwright의 touchscreen은 누르기만 하므로, 미는 손가락은 Chrome 개발자 도구 명령으로 보낸다. 실제 터치처럼 touch-action도 따른다
const sendTouch = (session: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", points: Point[]): Promise<unknown> =>
  session.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(({ x, y }, id) => ({ x, y, id })) });

interface SwipeParams {
  from: Point;
  to: Point;
  /** 움직임 사이에 쉬는 시간. 주면 천천히 민다 */
  stepPauseMs?: number;
  /** 손을 떼기 전에 할 일(미는 중인 모습 확인 등) */
  beforeRelease?: () => Promise<void>;
}

/** 한 손가락으로 처음 자리에서 끝 자리까지 여러 번에 나눠 민다 */
const swipe = async (page: Page, { from, to, stepPauseMs, beforeRelease }: SwipeParams): Promise<void> => {
  const session = await page.context().newCDPSession(page);
  const STEPS = 8;
  await sendTouch(session, "touchStart", [from]);
  for (let step = 1; step <= STEPS; step += 1) {
    if (stepPauseMs) await page.waitForTimeout(stepPauseMs);
    await sendTouch(session, "touchMove", [{ x: from.x + ((to.x - from.x) * step) / STEPS, y: from.y + ((to.y - from.y) * step) / STEPS }]);
  }
  await beforeRelease?.();
  await sendTouch(session, "touchEnd", []);
  await session.detach();
};

test.describe("캘린더 밀어 넘기기(#348)", () => {
  test("달력 칸을 왼쪽으로 밀면 다음 달로 넘어가 그 달 일정을 보여 주고 주소도 바뀐다", async ({ page }, testInfo) => {
    // Arrange: 넘어갈 달의 1일(처음 고르는 날)에 일정을 둔다
    const month = getMonth(testInfo);
    const nextMonth = shiftMonth(month, 1);
    const title = createTestName("E2E 밀어 다음 달", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date: `${nextMonth}-01` });
    try {
      await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
      const center = await getCenter(getSwipeArea(page));

      // Act
      await swipe(page, { from: { x: center.x + 80, y: center.y }, to: { x: center.x - 80, y: center.y } });

      // Assert
      await expect(getMonthTitle(page, nextMonth)).toBeVisible();
      await expect(page.locator("main").locator("visible=true").getByText(title, { exact: true })).toBeVisible();
      expect(new URL(page.url()).searchParams.get("month")).toBe(nextMonth);
    } finally {
      await deleteEvent();
    }
  });

  test("오른쪽으로 밀면 이전 달로 넘어간다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
    const center = await getCenter(getSwipeArea(page));

    // Act
    await swipe(page, { from: { x: center.x - 80, y: center.y }, to: { x: center.x + 80, y: center.y } });

    // Assert
    await expect(getMonthTitle(page, shiftMonth(month, -1))).toBeVisible();
  });

  test("천천히 조금만 밀면 달은 그대로이고, 민 자리의 날도 고르지 않는다", async ({ page }, testInfo) => {
    // Arrange: 처음 고른 날(1일)이 아닌 15일 위에서 밀기 시작한다
    const month = getMonth(testInfo);
    await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
    const start = await getCenter(getDayButton(page, `${month}-15`));

    // Act
    await swipe(page, { from: start, to: { x: start.x - 40, y: start.y }, stepPauseMs: 60 });

    // Assert
    await page.waitForTimeout(500);
    await expect(getMonthTitle(page, month)).toBeVisible();
    await expect(getDayButton(page, `${month}-15`)).toHaveAttribute("aria-pressed", "false");
    await expect(getDayButton(page, `${month}-01`)).toHaveAttribute("aria-pressed", "true");
  });

  test("화면 왼쪽 끝 24px에서 시작한 밀기는 뒤로 가기에 양보해 달을 넘기지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
    const center = await getCenter(getSwipeArea(page));

    // Act
    await swipe(page, { from: { x: BACK_GESTURE_EDGE_PX - 4, y: center.y }, to: { x: BACK_GESTURE_EDGE_PX + 196, y: center.y } });

    // Assert
    await page.waitForTimeout(500);
    await expect(getMonthTitle(page, month)).toBeVisible();
    expect(new URL(page.url()).searchParams.get("month")).toBe(month);
  });

  test("세로로 밀면 달을 넘기지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
    const center = await getCenter(getSwipeArea(page));

    // Act: 가로로도 조금 움직이지만 세로가 훨씬 길다
    await swipe(page, { from: { x: center.x, y: center.y + 60 }, to: { x: center.x - 30, y: center.y - 120 } });

    // Assert
    await page.waitForTimeout(500);
    await expect(getMonthTitle(page, month)).toBeVisible();
  });

  test("누른 채 잠깐 멈췄다가 빠르게 튕기면 조금만 밀어도 넘어간다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
    const center = await getCenter(getSwipeArea(page));
    const session = await page.context().newCDPSession(page);

    // Act: 400ms 멈췄다가 폭의 4분의 1보다 짧게(60px) 튕긴다
    await sendTouch(session, "touchStart", [center]);
    await page.waitForTimeout(400);
    for (let step = 1; step <= 4; step += 1) await sendTouch(session, "touchMove", [{ x: center.x - step * 15, y: center.y }]);
    await sendTouch(session, "touchEnd", []);
    await session.detach();

    // Assert
    await expect(getMonthTitle(page, shiftMonth(month, 1))).toBeVisible();
  });

  test("마우스를 달력 밖에서 뗀 뒤에도 다시 밀어 넘길 수 있다", async ({ page }, testInfo) => {
    // Arrange: 달력 위에서 누른 채 한 번에 달력 밖(아래)으로 나가 뗀다. 달력은 움직임도 뗌도 알지 못한다
    const month = getMonth(testInfo);
    await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
    const area = getSwipeArea(page);
    const center = await getCenter(area);
    const box = await area.boundingBox();
    if (!box) throw new Error("달력 칸이 화면에 없습니다");
    await page.mouse.move(center.x, center.y);
    await page.mouse.down();
    await page.mouse.move(center.x, box.y + box.height + 40);
    await page.mouse.up();

    // Act
    await swipe(page, { from: { x: center.x + 80, y: center.y }, to: { x: center.x - 80, y: center.y } });

    // Assert
    await expect(getMonthTitle(page, shiftMonth(month, 1))).toBeVisible();
  });

  test.describe("움직임을 줄이지 않은 기기", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("미는 동안 달력 칸이 손가락을 따라 움직이고, 손을 떼면 다음 달이 제자리로 들어온다", async ({ page }, testInfo) => {
      // Arrange
      const month = getMonth(testInfo);
      await openScreen(page, `${CALENDAR_PATH}?month=${month}`, getMonthTitle(page, month));
      const area = getSwipeArea(page);
      const center = await getCenter(area);

      // Act
      await swipe(page, {
        from: { x: center.x + 60, y: center.y },
        to: { x: center.x - 60, y: center.y },
        // Assert: 손을 떼기 전에는 민 만큼(120px) 왼쪽으로 옮겨져 있다
        beforeRelease: async () => {
          await expect(area).toHaveCSS("transform", "matrix(1, 0, 0, 1, -120, 0)");
          await expect(getMonthTitle(page, month)).toBeVisible();
        },
      });

      // Assert
      await expect(getMonthTitle(page, shiftMonth(month, 1))).toBeVisible();
      await expect(area).toHaveCSS("transform", "none");
    });
  });
});
