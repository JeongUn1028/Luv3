import type { Page } from "@playwright/test";
import { expectImageLoaded, getCouplePhoto } from "./support/actions";
import { findRememberedPath, plantRememberedUrl, readRememberedPhotoUrls } from "./support/remembered-photos";
import { expect, test } from "./support/test";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** 홈을 열어 커플 사진을 받고, 휴대폰이 기억한 경로와 서버가 준 주소를 돌려준다 */
const openHomeAndReadPhoto = async (page: Page) => {
  await page.goto("/");
  const photo = getCouplePhoto(page);
  await expectImageLoaded(photo);
  const serverUrl = (await photo.getAttribute("src")) ?? "";
  return { photo, serverUrl, path: await findRememberedPath(page, serverUrl) };
};

test.describe("홈 커플 사진 주소 기억", () => {
  test("받은 사진의 주소를 기억해, 서버가 다른 주소를 줘도 기억한 주소로 그린다", async ({ page }) => {
    // Arrange
    const { serverUrl, path } = await openHomeAndReadPhoto(page);
    expect(path).toBeDefined();
    const planted = await plantRememberedUrl(page, { path: path ?? "", serverUrl, expiresAt: Date.now() + 3 * DAY_MS });

    // Act
    await page.reload();

    // Assert
    const photo = getCouplePhoto(page);
    await expectImageLoaded(photo);
    await expect(photo).toHaveAttribute("src", planted);
  });

  test("기억한 주소가 곧 만료되면 쓰지 않고 서버 주소를 쓴다", async ({ page }) => {
    // Arrange
    const { serverUrl, path } = await openHomeAndReadPhoto(page);
    const planted = await plantRememberedUrl(page, { path: path ?? "", serverUrl, expiresAt: Date.now() + HOUR_MS / 2 });

    // Act
    await page.reload();

    // Assert
    const photo = getCouplePhoto(page);
    await expectImageLoaded(photo);
    await expect(photo).not.toHaveAttribute("src", planted);
    expect((await readRememberedPhotoUrls(page))[path ?? ""]?.url).toBe(await photo.getAttribute("src"));
  });

  test("기억한 주소로 받지 못하면 잊고 서버 주소로 다시 받는다", async ({ page }) => {
    // Arrange
    const { serverUrl, path } = await openHomeAndReadPhoto(page);
    const planted = await plantRememberedUrl(page, { path: path ?? "", serverUrl, expiresAt: Date.now() + 3 * DAY_MS, isBroken: true });

    // Act
    await page.reload();

    // Assert
    const photo = getCouplePhoto(page);
    await expect(photo).not.toHaveAttribute("src", planted);
    await expectImageLoaded(photo);
    expect((await readRememberedPhotoUrls(page))[path ?? ""]?.url).not.toBe(planted);
  });
});
