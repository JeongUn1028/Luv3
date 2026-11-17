import type { Locator, Page } from "@playwright/test";
import { expectImageLoaded } from "./support/actions";
import { PHOTO_COUNT, PHOTO_RECORD } from "./support/constants";
import { expect, test } from "./support/test";

// 기록 사진 크게 보기(#350). 상세 사진을 누르면 화면 전체에 원래 비율로 보여 주고, 넘겨 본 사진에서 닫으면 상세도 그 사진으로 돌아온다

const DETAIL_PATH = `/dates/${PHOTO_RECORD.id}`;

const getViewer = (page: Page): Locator => page.getByRole("dialog", { name: `${PHOTO_RECORD.title} 사진` });
const getViewerPhoto = (page: Page, order: number): Locator => getViewer(page).getByRole("img", { name: `${PHOTO_RECORD.title} 사진 ${order}`, exact: true });
const getOpenButton = (page: Page, order: number): Locator =>
  page.getByRole("button", { name: `${PHOTO_RECORD.title} 사진 ${order} 크게 보기` }).locator("visible=true");

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
});
