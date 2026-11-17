import type { Locator, Page } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { expectImageLoaded } from "./support/actions";
import { PHOTO_RECORD } from "./support/constants";
import { findRememberedPath, plantRememberedUrl } from "./support/remembered-photos";
import { expect, test } from "./support/test";

// 기록 그리드·상세 사진도 휴대폰이 경로로 주소를 기억해, 서버 인스턴스가 바뀌어 새 주소를 줘도 받은 사진을 다시 받지 않는다(#354)

const HOUR_MS = 60 * 60 * 1000;
const DETAIL_PATH = `/dates/${PHOTO_RECORD.id}`;

const getGridPhoto = (page: Page): Locator => page.getByRole("img", { name: PHOTO_RECORD.title }).locator("visible=true");
const getDetailPhoto = (page: Page): Locator => page.getByRole("img", { name: `${PHOTO_RECORD.title} 사진 1` }).locator("visible=true");

/** 화면을 열어 사진을 받고, 휴대폰이 그 주소를 기억한 경로와 서버가 준 주소를 돌려준다 */
const openAndReadPhoto = async (page: Page, screenPath: string, getPhoto: (page: Page) => Locator) => {
  await page.goto(screenPath);
  const photo = getPhoto(page);
  await expectImageLoaded(photo);
  const serverUrl = (await photo.getAttribute("src")) ?? "";
  return { serverUrl, path: await findRememberedPath(page, serverUrl) };
};

for (const { name, screenPath, getPhoto } of [
  { name: "그리드 썸네일", screenPath: RECORDS_PATH, getPhoto: getGridPhoto },
  { name: "상세 원본", screenPath: DETAIL_PATH, getPhoto: getDetailPhoto },
]) {
  test(`${name}은 받은 주소를 기억해, 서버가 다른 주소를 줘도 기억한 주소로 그린다`, async ({ page }) => {
    // Arrange
    const { serverUrl, path } = await openAndReadPhoto(page, screenPath, getPhoto);
    expect(path).toBeDefined();
    const planted = await plantRememberedUrl(page, { path: path ?? "", serverUrl, expiresAt: Date.now() + 2 * HOUR_MS });

    // Act
    await page.reload();

    // Assert
    const photo = getPhoto(page);
    await expectImageLoaded(photo);
    await expect(photo).toHaveAttribute("src", planted);
  });
}

test("상세 원본을 기억한 주소로 받지 못하면 잊고 서버 주소로 다시 받는다", async ({ page }) => {
  // Arrange
  const { serverUrl, path } = await openAndReadPhoto(page, DETAIL_PATH, getDetailPhoto);
  const planted = await plantRememberedUrl(page, { path: path ?? "", serverUrl, expiresAt: Date.now() + 2 * HOUR_MS, isBroken: true });

  // Act
  await page.reload();

  // Assert
  const photo = getDetailPhoto(page);
  await expect(photo).not.toHaveAttribute("src", planted);
  await expectImageLoaded(photo);
});

test("보고 있는 상세 사진은 기억한 주소가 다시 쓰는 기준 시간 아래로 내려가도 다시 받지 않는다", async ({ page }) => {
  // Arrange: 기준(1시간 남음)보다 1분 더 남은 주소를 심고 그 주소로 사진을 받는다
  await page.clock.install();
  const { serverUrl, path } = await openAndReadPhoto(page, DETAIL_PATH, getDetailPhoto);
  const now = await page.evaluate(() => Date.now());
  const planted = await plantRememberedUrl(page, { path: path ?? "", serverUrl, expiresAt: now + HOUR_MS + 60_000 });
  await page.reload();
  await expectImageLoaded(getDetailPhoto(page));
  await expect(getDetailPhoto(page)).toHaveAttribute("src", planted);

  // Act: 2분 지나 기준 아래로 내려간 뒤, 다른 사진이 주소를 기억한 것처럼 알린다
  await page.clock.fastForward("02:00");
  await page.evaluate(() => window.dispatchEvent(new StorageEvent("storage", { key: null })));

  // Assert
  await expect(getDetailPhoto(page)).toHaveAttribute("src", planted);
});
