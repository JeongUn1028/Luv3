import type { Locator, Page } from "@playwright/test";
import { toCouplePhotoMediumPath } from "@/lib/photos/paths";
import { COUPLE_PHOTO_PATH, PHOTO_FIXTURE_PATH } from "./support/constants";
import { TARGET_DEVICES } from "./support/devices";
import { getCouplePhotoPath, switchToE2eCouplePhoto } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 커플 사진을 실제로 바꿔 홈에 새 사진이 나오고 다시 열어도 남는지(#258).
// 커플 사진은 두 사람이 하나를 함께 쓰므로 나란히 도는 다른 스펙이 깨지지 않게, 기기 프로젝트가 모두 끝난 뒤 따로 돈다
// (`SHARED_DATA_SPECS`, playwright.config.ts의 teardown). 두 기기 크기는 여기서 차례로 돈다

const getCouplePhoto = (page: Page): Locator => page.getByRole("img", { name: "커플 사진" }).locator("visible=true");

/** 사진이 실제로 받아져 그려졌는지 */
const expectPhotoLoaded = (photo: Locator) =>
  expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0)).toBe(true);

/** 서명 주소의 파일 경로 부분(`.../object/sign/album/<경로>?token=`) */
const readPhotoPath = async (photo: Locator): Promise<string> => {
  const source = (await photo.getAttribute("src")) ?? "";
  return decodeURIComponent(new URL(source).pathname).replace(/^.*\/object\/sign\/album\//, "");
};

for (const device of TARGET_DEVICES) {
  test.describe(`커플 사진 바꾸기 (${device.name})`, () => {
    test.use(device.use);

    test("사진을 골라 바꾸면 홈에 새 사진이 나오고, 다시 열어도 새 사진이 남는다", async ({ page }) => {
      // Arrange
      const restore = await switchToE2eCouplePhoto();
      try {
        const openMenu = page.getByRole("button", { name: "커플 사진 바꾸기" });
        await openScreen(page, "/", openMenu);
        expect(await readPhotoPath(getCouplePhoto(page))).toBe(COUPLE_PHOTO_PATH);

        // Act
        await openMenu.tap();
        const fileChooser = page.waitForEvent("filechooser");
        await page.getByRole("dialog", { name: "커플 사진", exact: true }).getByRole("button", { name: "사진 바꾸기" }).tap();
        await (await fileChooser).setFiles(PHOTO_FIXTURE_PATH);

        // Assert: 줄이기·올리기·저장이 끝나면 저장한 새 경로의 홈 카드용(중간 크기) 사진을 그린다
        await expect.poll(() => readPhotoPath(getCouplePhoto(page)), { timeout: 20_000 }).not.toBe(COUPLE_PHOTO_PATH);
        const savedPath = await getCouplePhotoPath();
        expect(savedPath).toMatch(/^couple\/[0-9a-f-]{36}\.jpg$/);
        expect(savedPath).not.toBe(COUPLE_PHOTO_PATH);
        const savedMediumPath = toCouplePhotoMediumPath(savedPath ?? "");
        expect(await readPhotoPath(getCouplePhoto(page))).toBe(savedMediumPath);
        await expectPhotoLoaded(getCouplePhoto(page));
        await expect(page.getByText("사진 올리는 중…").locator("visible=true")).toHaveCount(0);
        await expect(openMenu).toBeVisible();

        // Act
        await page.reload();

        // Assert
        await expectPhotoLoaded(getCouplePhoto(page));
        expect(await readPhotoPath(getCouplePhoto(page))).toBe(savedMediumPath);
      } finally {
        await restore();
      }
    });
  });
}
