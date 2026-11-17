import type { CDPSession, Locator, Page } from "@playwright/test";
import { expectImageLoaded } from "./support/actions";
import { PHOTO_COUNT, PHOTO_RECORD } from "./support/constants";
import { expect, test } from "./support/test";

// 기록 사진 크게 보기(#350). 상세 사진을 누르면 화면 전체에 원래 비율로 보여 주고, 넘겨 본 사진에서 닫으면 상세도 그 사진으로 돌아온다

const DETAIL_PATH = `/dates/${PHOTO_RECORD.id}`;

const getViewer = (page: Page): Locator => page.getByRole("dialog", { name: `${PHOTO_RECORD.title} 사진` });
const getViewerPhoto = (page: Page, order: number): Locator => getViewer(page).getByRole("img", { name: `${PHOTO_RECORD.title} 사진 ${order}`, exact: true });
const getOpenButton = (page: Page, order: number): Locator =>
  page.getByRole("button", { name: `${PHOTO_RECORD.title} 사진 ${order} 크게 보기` }).locator("visible=true");

interface TouchPoint {
  x: number;
  y: number;
}

// Playwright의 touchscreen은 한 손가락만 누르므로, 두 손가락은 Chrome 개발자 도구 명령으로 보낸다
const sendTouch = (session: CDPSession, type: "touchStart" | "touchMove" | "touchEnd", points: TouchPoint[]): Promise<unknown> =>
  session.send("Input.dispatchTouchEvent", { type, touchPoints: points.map(({ x, y }, id) => ({ x, y, id })) });

/** 손가락들을 처음 자리에서 끝 자리로 여러 번에 나눠 옮긴다 */
const dragTouches = async (page: Page, from: TouchPoint[], to: TouchPoint[]): Promise<void> => {
  const session = await page.context().newCDPSession(page);
  const STEPS = 8;
  await sendTouch(session, "touchStart", from);
  for (let step = 1; step <= STEPS; step += 1) {
    await sendTouch(
      session,
      "touchMove",
      from.map((point, index) => ({ x: point.x + ((to[index].x - point.x) * step) / STEPS, y: point.y + ((to[index].y - point.y) * step) / STEPS })),
    );
  }
  await sendTouch(session, "touchEnd", []);
  await session.detach();
};

const getBox = async (locator: Locator): Promise<{ x: number; y: number; width: number; height: number }> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("사진이 화면에 없다");
  return box;
};

const openViewer = async (page: Page): Promise<Locator> => {
  await openDetail(page);
  await getOpenButton(page, 1).click();
  const photo = getViewerPhoto(page, 1);
  await expectImageLoaded(photo);
  return photo;
};

const openDetail = async (page: Page): Promise<void> => {
  await page.goto(DETAIL_PATH);
  await expectImageLoaded(page.getByRole("img", { name: `${PHOTO_RECORD.title} 사진 1` }).locator("visible=true"));
};

test.describe("기록 사진 크게 보기", () => {
  test("상세 사진을 누르면 화면 전체에 그 사진을 원래 비율로 보여 주고, 몇 번째 사진인지와 장소를 함께 보인다", async ({ page }) => {
    // Arrange
    await openDetail(page);

    // Act
    await getOpenButton(page, 1).click();

    // Assert
    const viewer = getViewer(page);
    await expect(viewer).toBeVisible();
    await expect(viewer.getByText(`1 / ${PHOTO_COUNT}`)).toBeVisible();
    await expect(viewer.getByText("E2E 기본 위치")).toBeVisible();
    const photo = getViewerPhoto(page, 1);
    await expectImageLoaded(photo);
    // 자르지 않고 원래 비율 그대로다
    expect(await photo.evaluate((image: HTMLImageElement) => getComputedStyle(image).objectFit)).toBe("contain");
    const box = await photo.boundingBox();
    const ratio = await photo.evaluate((image: HTMLImageElement) => image.naturalWidth / image.naturalHeight);
    expect((box?.width ?? 0) / (box?.height ?? 1)).toBeCloseTo(ratio, 1);
  });

  test("크게 보기에서 다음 사진으로 넘긴 뒤 닫으면 상세도 그 사진으로 돌아오고 초점도 그 사진에 둔다", async ({ page }) => {
    // Arrange
    await openDetail(page);
    await getOpenButton(page, 1).click();
    const viewer = getViewer(page);
    await expect(viewer).toBeVisible();

    // Act
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText(`2 / ${PHOTO_COUNT}`)).toBeVisible();
    await expectImageLoaded(getViewerPhoto(page, 2));
    await viewer.getByRole("button", { name: "닫기" }).click();

    // Assert
    await expect(viewer).toBeHidden();
    await expect(page.getByText(`2 / ${PHOTO_COUNT}`).locator("visible=true")).toBeVisible();
    await expect(getOpenButton(page, 2)).toBeInViewport();
    await expect(getOpenButton(page, 2)).toBeFocused();
  });

  test("상세 사진을 옆으로 밀어 넘기면 크게 보기를 열지 않는다", async ({ page }) => {
    // Arrange
    await openDetail(page);
    const box = await getOpenButton(page, 1).boundingBox();
    const y = (box?.y ?? 0) + (box?.height ?? 0) / 2;

    // Act
    await page.mouse.move((box?.x ?? 0) + (box?.width ?? 0) - 20, y);
    await page.mouse.down();
    await page.mouse.move((box?.x ?? 0) + 20, y, { steps: 8 });
    await page.mouse.up();

    // Assert
    await expect(page.getByText(`2 / ${PHOTO_COUNT}`).locator("visible=true")).toBeVisible();
    await expect(getViewer(page)).toBeHidden();
  });

  test("크게 보기 사진을 두 번 누르면 확대하고, 다시 두 번 누르면 원래 크기로 돌아간다", async ({ page }) => {
    // Arrange
    const photo = await openViewer(page);
    const before = await getBox(photo);
    const center = { x: before.x + before.width / 2, y: before.y + before.height / 2 };

    // Act
    await page.touchscreen.tap(center.x, center.y);
    await page.touchscreen.tap(center.x, center.y);

    // Assert
    await expect.poll(async () => (await getBox(photo)).width / before.width).toBeCloseTo(2.5, 1);

    // Act: 다시 두 번 누른다
    await page.touchscreen.tap(center.x, center.y);
    await page.touchscreen.tap(center.x, center.y);

    // Assert
    await expect.poll(async () => (await getBox(photo)).width / before.width).toBeCloseTo(1, 1);
  });

  test("크게 보기 사진을 두 손가락으로 벌리면 그만큼 키우고, 확대한 동안 한 손가락으로 끌면 넘기지 않고 사진을 옮긴다", async ({ page }) => {
    // Arrange
    const photo = await openViewer(page);
    const before = await getBox(photo);
    const center = { x: before.x + before.width / 2, y: before.y + before.height / 2 };

    // Act: 사이 80px을 240px로 벌린다
    await dragTouches(
      page,
      [
        { x: center.x - 40, y: center.y },
        { x: center.x + 40, y: center.y },
      ],
      [
        { x: center.x - 120, y: center.y },
        { x: center.x + 120, y: center.y },
      ],
    );

    // Assert
    await expect.poll(async () => (await getBox(photo)).width / before.width).toBeCloseTo(3, 1);
    const zoomed = await getBox(photo);

    // Act: 한 손가락으로 왼쪽으로 끈다
    await dragTouches(page, [center], [{ x: center.x - 100, y: center.y }]);

    // Assert
    await expect.poll(async () => (await getBox(photo)).x - zoomed.x).toBeCloseTo(-100, -1);
    await expect(getViewer(page).getByText(`1 / ${PHOTO_COUNT}`)).toBeVisible();
  });

  test("확대한 사진은 다른 사진으로 넘겼다 돌아오면 원래 크기로 보인다", async ({ page }) => {
    // Arrange
    const photo = await openViewer(page);
    const before = await getBox(photo);
    const center = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    await page.touchscreen.tap(center.x, center.y);
    await page.touchscreen.tap(center.x, center.y);
    await expect.poll(async () => (await getBox(photo)).width / before.width).toBeCloseTo(2.5, 1);
    const viewer = getViewer(page);

    // Act
    await page.keyboard.press("ArrowRight");
    await expect(viewer.getByText(`2 / ${PHOTO_COUNT}`)).toBeVisible();
    await page.keyboard.press("ArrowLeft");
    await expect(viewer.getByText(`1 / ${PHOTO_COUNT}`)).toBeVisible();

    // Assert
    await expect.poll(async () => (await getBox(photo)).width / before.width).toBeCloseTo(1, 1);
  });

  test("한 손가락으로 조금 끌다가 두 번째 손가락을 대고 벌리면 넘기지 않고 지금 사진을 키운다", async ({ page }) => {
    // Arrange: 실제 손가락은 차례로 닿는다
    const photo = await openViewer(page);
    const before = await getBox(photo);
    const center = { x: before.x + before.width / 2, y: before.y + before.height / 2 };
    const session = await page.context().newCDPSession(page);

    // Act: 첫 손가락을 왼쪽으로 빠르게 끌다가 두 번째 손가락을 대고 벌린다
    await sendTouch(session, "touchStart", [{ x: center.x + 40, y: center.y }]);
    for (let step = 1; step <= 4; step += 1) await sendTouch(session, "touchMove", [{ x: center.x + 40 - step * 15, y: center.y }]);
    await sendTouch(session, "touchStart", [
      { x: center.x - 20, y: center.y },
      { x: center.x + 60, y: center.y },
    ]);
    for (let step = 1; step <= 8; step += 1) {
      await sendTouch(session, "touchMove", [
        { x: center.x - 20 - step * 10, y: center.y },
        { x: center.x + 60 + step * 10, y: center.y },
      ]);
    }
    await sendTouch(session, "touchEnd", []);
    await session.detach();

    // Assert
    await expect(getViewer(page).getByText(`1 / ${PHOTO_COUNT}`)).toBeVisible();
    await expect.poll(async () => (await getBox(photo)).width / before.width).toBeGreaterThan(1.8);
    await page.waitForTimeout(500);
    await expect(getViewer(page).getByText(`1 / ${PHOTO_COUNT}`)).toBeVisible();
  });
});
