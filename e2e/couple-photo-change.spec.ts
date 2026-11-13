import type { Locator, Page, Route } from "@playwright/test";
import { toCouplePhotoMediumPath } from "@/lib/photos/paths";
import { expectImageLoaded, getCouplePhoto } from "./support/actions";
import { COUPLE_PHOTO_PATH, PHOTO_FIXTURE_PATH } from "./support/constants";
import { TARGET_DEVICES } from "./support/devices";
import { getCouplePhotoPath, switchToE2eCouplePhoto } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 커플 사진을 실제로 바꿔 홈에 새 사진이 나오고 다시 열어도 남는지(#258), 고르자마자 새 사진을 먼저 보여 주는지(#329).
// 커플 사진은 두 사람이 하나를 함께 쓰므로 나란히 도는 다른 스펙이 깨지지 않게, 기기 프로젝트가 모두 끝난 뒤 따로 돈다
// (`SHARED_DATA_SPECS`, playwright.config.ts의 teardown). 두 기기 크기는 여기서 차례로 돈다

/** 줄이기·올리기·저장까지 기다리는 시간. CI 러너는 로컬(약 1초)보다 훨씬 느릴 수 있다 */
const SAVE_TIMEOUT_MS = 20_000;

const SAVE_PATH_URL = "**/rest/v1/rpc/set_couple_photo";
const CLEAR_PATH_URL = "**/rest/v1/rpc/clear_couple_photo";
const COUPLE_UPLOAD_URL = "**/storage/v1/object/album/couple/**";

/** 서명 주소의 파일 경로 부분(`.../object/sign/album/<경로>?token=`). 미리 보여 주는 사진(`blob:`)이면 그 주소 그대로 */
const readPhotoPath = async (photo: Locator): Promise<string> => {
  const source = (await photo.getAttribute("src")) ?? "";
  if (source.startsWith("blob:")) return source;
  return decodeURIComponent(new URL(source).pathname).replace(/^.*\/object\/sign\/album\//, "");
};

/** 요청 하나를 테스트가 풀어 줄 때까지 붙잡는다 */
const holdRequest = async (page: Page, url: string, finish: (route: Route) => Promise<void>) => {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(url, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await released;
    return finish(route);
  });
  return release;
};

const getUploadingBadge = (page: Page): Locator => page.getByText("올리는 중", { exact: true }).locator("visible=true");

const pickCouplePhoto = async (page: Page, openMenu: Locator): Promise<void> => {
  await openMenu.tap();
  const fileChooser = page.waitForEvent("filechooser");
  await page.getByRole("dialog", { name: "커플 사진", exact: true }).getByRole("button", { name: "사진 바꾸기" }).tap();
  await (await fileChooser).setFiles(PHOTO_FIXTURE_PATH);
};

for (const device of TARGET_DEVICES) {
  test.describe(`커플 사진 바꾸기 (${device.name})`, () => {
    test.use(device.use);

    test("사진을 고르면 저장을 기다리지 않고 새 사진을 보여 주고, 저장이 끝나면 서버의 새 사진으로 바꾸며 다시 열어도 남는다", async ({ page }) => {
      // 저장 기다림이 테스트 시간 제한(기본 30초)에 먼저 걸려 원인 없는 시간 초과로 끝나지 않게 넉넉히 둔다
      test.setTimeout(60_000);

      // Arrange
      const restore = await switchToE2eCouplePhoto();
      try {
        const openMenu = page.getByRole("button", { name: "커플 사진 바꾸기" });
        await openScreen(page, "/", openMenu);
        expect(await readPhotoPath(getCouplePhoto(page))).toBe(COUPLE_PHOTO_PATH);
        const releaseSave = await holdRequest(page, SAVE_PATH_URL, (route) => route.continue());

        // Act
        await pickCouplePhoto(page, openMenu);

        // Assert: 경로를 저장하기 전인데도 고른 사진을 그리고, 올리는 중 표시만 덧붙인다
        await expect.poll(() => readPhotoPath(getCouplePhoto(page))).toMatch(/^blob:/);
        await expectImageLoaded(getCouplePhoto(page));
        await expect(getUploadingBadge(page)).toBeVisible();
        await expect(openMenu).toHaveCount(0);

        // Act
        releaseSave();

        // Assert: 저장한 새 경로의 홈 카드용(중간 크기) 사진을 받아 그린다
        await expect.poll(() => readPhotoPath(getCouplePhoto(page)), { timeout: SAVE_TIMEOUT_MS }).not.toMatch(/^blob:/);
        const savedPath = await getCouplePhotoPath();
        if (savedPath === undefined) throw new Error("커플 사진 경로가 비었다");
        expect(savedPath).not.toBe(COUPLE_PHOTO_PATH);
        expect(await readPhotoPath(getCouplePhoto(page))).toBe(toCouplePhotoMediumPath(savedPath));
        await expectImageLoaded(getCouplePhoto(page));
        await expect(getUploadingBadge(page)).toHaveCount(0);
        await expect(openMenu).toBeVisible();

        // Act
        await page.reload();

        // Assert
        await expectImageLoaded(getCouplePhoto(page));
        expect(await readPhotoPath(getCouplePhoto(page))).toBe(toCouplePhotoMediumPath(savedPath));
      } finally {
        // 실패해 끝날 때 올리기·저장이 아직 돌고 있으면 되돌린 뒤에 저장이 끝나 원래 사진을 밀어낼 수 있다. 화면을 먼저 닫아 요청을 끊는다
        await page.close();
        await restore();
      }
    });

    test("새 사진을 올리지 못하면 원래 사진으로 되돌리고 안내한다", async ({ page }) => {
      // Arrange: 올리기는 다시 보내도 실패한다
      const restore = await switchToE2eCouplePhoto();
      try {
        const openMenu = page.getByRole("button", { name: "커플 사진 바꾸기" });
        await openScreen(page, "/", openMenu);
        const releaseUpload = await holdRequest(page, COUPLE_UPLOAD_URL, (route) => route.abort("connectionreset"));

        // Act
        await pickCouplePhoto(page, openMenu);
        await expect.poll(() => readPhotoPath(getCouplePhoto(page))).toMatch(/^blob:/);
        releaseUpload();

        // Assert
        await expect(page.locator("main").getByRole("alert").locator("visible=true")).toHaveText("사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.", {
          timeout: SAVE_TIMEOUT_MS,
        });
        expect(await readPhotoPath(getCouplePhoto(page))).toBe(COUPLE_PHOTO_PATH);
        await expect(getUploadingBadge(page)).toHaveCount(0);
        await expect(openMenu).toBeVisible();
        expect(await getCouplePhotoPath()).toBe(COUPLE_PHOTO_PATH);
      } finally {
        await page.close();
        await restore();
      }
    });

    // 커플 사진은 두 사람이 함께 쓰므로 실제로 지우지 않는다. 비우는 요청만 붙들어 실패 응답을 대신 돌려준다
    test("지우기를 누르면 저장을 기다리지 않고 추가 칸을 보여 주고, 지우지 못하면 사진을 되돌리고 안내한다", async ({ page }) => {
      // Arrange
      const restore = await switchToE2eCouplePhoto();
      try {
        const openMenu = page.getByRole("button", { name: "커플 사진 바꾸기" });
        await openScreen(page, "/", openMenu);
        const releaseClear = await holdRequest(page, CLEAR_PATH_URL, (route) => route.fulfill({ status: 500, json: { message: "E2E 삭제 실패" } }));
        const addButton = page.getByRole("button", { name: "커플 사진 추가" }).locator("visible=true");

        // Act
        await openMenu.tap();
        await page.getByRole("button", { name: "사진 지우기" }).tap();
        await page.getByRole("dialog", { name: "커플 사진을 지울까요?" }).getByRole("button", { name: "지우기" }).tap();

        // Assert: 창을 닫고 바로 추가 칸. 지우는 동안에는 눌러도 사진 고르기가 열리지 않는다
        await expect(page.getByRole("dialog")).toHaveCount(0);
        await expect(addButton).toBeVisible();
        await expect(addButton).toHaveAttribute("aria-disabled", "true");
        await expect(addButton).toBeFocused();
        await expect(getCouplePhoto(page)).toHaveCount(0);

        // Act
        releaseClear();

        // Assert
        await expect(page.locator("main").getByRole("alert").locator("visible=true")).toHaveText("사진을 지우지 못했어요. 잠시 후 다시 시도해 주세요.");
        await expectImageLoaded(getCouplePhoto(page));
        expect(await readPhotoPath(getCouplePhoto(page))).toBe(COUPLE_PHOTO_PATH);
        await expect(openMenu).toBeFocused();
      } finally {
        await page.close();
        await restore();
      }
    });
  });
}
