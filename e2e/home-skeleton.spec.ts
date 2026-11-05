import type { Locator, Page } from "@playwright/test";
import { E2E_EVENTS, E2E_TODOS, PHOTO_RECORD } from "./support/constants";
import { expect, getScrollArea, openScreen, test } from "./support/test";

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const TOLERANCE = 1;

const getBox = async (locator: Locator): Promise<Box> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("요소가 화면에 있어야 잴 수 있습니다");
  return box;
};

/** 스크롤 영역 안의 보이는 칸: 커플 사진, 최근 데이트, 일정, 하고 싶은 것 */
const getHomeSlots = async (page: Page): Promise<{ photo: Box; latest: Locator; upcoming: Locator; todo: Box }> => {
  const rows = getScrollArea(page).locator("> *").locator("visible=true");
  const tiles = rows.nth(1).locator("> *").locator("visible=true");

  return { photo: await getBox(rows.nth(0)), latest: tiles.nth(0), upcoming: tiles.nth(1), todo: await getBox(rows.nth(2)) };
};

/** 칸 왼쪽 위를 기준으로 한 위쪽 거리 */
const getOffsetTop = async (tile: Locator, inner: Locator): Promise<number> => (await getBox(inner)).y - (await getBox(tile)).y;

const expectSameBox = (skeleton: Box, loaded: Box): void => {
  expect(Math.abs(skeleton.x - loaded.x)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(skeleton.y - loaded.y)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(skeleton.width - loaded.width)).toBeLessThanOrEqual(TOLERANCE);
  expect(Math.abs(skeleton.height - loaded.height)).toBeLessThanOrEqual(TOLERANCE);
};

test.describe("홈 뼈대", () => {
  test("칸 크기·위치와 안쪽 줄 위치가 실제 내용과 같다", async ({ page, browser, context, safeArea, viewport, deviceScaleFactor, isMobile, hasTouch }) => {
    // Arrange: 실제 내용
    await openScreen(page, "/", page.getByText(E2E_TODOS[0].content));
    await expect(page.getByText(PHOTO_RECORD.title)).toBeVisible();
    await expect(page.getByText(E2E_EVENTS[0].title)).toBeVisible();
    const loaded = await getHomeSlots(page);

    // JavaScript를 끄면 스트리밍된 내용이 끼워지지 않아 뼈대가 그대로 남는다
    const skeletonContext = await browser.newContext({
      viewport,
      deviceScaleFactor,
      isMobile,
      hasTouch,
      storageState: await context.storageState(),
      javaScriptEnabled: false,
    });
    const skeletonPage = await skeletonContext.newPage();
    const session = await skeletonContext.newCDPSession(skeletonPage);
    await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { ...safeArea, left: 0, right: 0 } });

    try {
      // Act
      await skeletonPage.goto("/");
      const skeleton = await getHomeSlots(skeletonPage);

      // Assert: 칸
      expectSameBox(skeleton.photo, loaded.photo);
      expectSameBox(await getBox(skeleton.latest), await getBox(loaded.latest));
      expectSameBox(await getBox(skeleton.upcoming), await getBox(loaded.upcoming));
      expectSameBox(skeleton.todo, loaded.todo);

      // Assert: 최근 데이트의 라벨·제목·날짜 줄
      const latestLines = skeleton.latest.locator(".bg-line");
      await expect(latestLines).toHaveCount(3);
      const latestTargets = [
        loaded.latest.getByRole("heading", { name: "최근 데이트" }),
        loaded.latest.getByText(PHOTO_RECORD.title),
        loaded.latest.locator("a > span > span").last(),
      ];
      for (const [index, target] of latestTargets.entries()) {
        const skeletonTop = await getOffsetTop(skeleton.latest, latestLines.nth(index));
        expect(Math.abs(skeletonTop - (await getOffsetTop(loaded.latest, target)))).toBeLessThanOrEqual(TOLERANCE);
      }

      // Assert: 일정의 제목·날짜·일정 제목·설명 줄
      const upcomingLines = skeleton.upcoming.locator(".bg-line");
      await expect(upcomingLines).toHaveCount(4);
      const upcomingTargets = [
        loaded.upcoming.getByRole("heading"),
        loaded.upcoming.locator("> p").first(),
        loaded.upcoming.locator("li").first().locator("p").first(),
        loaded.upcoming.locator("li").first().locator("p").last(),
      ];
      for (const [index, target] of upcomingTargets.entries()) {
        const skeletonTop = await getOffsetTop(skeleton.upcoming, upcomingLines.nth(index));
        expect(Math.abs(skeletonTop - (await getOffsetTop(loaded.upcoming, target)))).toBeLessThanOrEqual(TOLERANCE);
      }
    } finally {
      await skeletonContext.close();
    }
  });
});
