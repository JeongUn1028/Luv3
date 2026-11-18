import type { Page, Request } from "@playwright/test";
import { HOME_PHOTO_COOKIE } from "@/lib/photos/home-photo-cookie";
import { expectImageLoaded, getCouplePhoto } from "./support/actions";
import { findRememberedPath, plantRememberedUrl, readHomePhotoCookie, readRememberedPhotoUrls } from "./support/remembered-photos";
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

/** 서버가 처음 보내는 HTML에서 커플 사진 요소를 찾는다. 화면 코드가 뜨기 전에 받기 시작하는지 본다 */
const readServerCouplePhotoTag = async (page: Page): Promise<string | undefined> => {
  const html = await (await page.request.get("/")).text();
  return /<img[^>]*alt="커플 사진"[^>]*>/.exec(html)?.[0];
};

const toHtmlAttribute = (value: string): string => value.replaceAll("&", "&amp;");

const isCouplePhotoRequest = (request: Request, path: string): boolean => decodeURIComponent(new URL(request.url()).pathname).endsWith(`/album/${path}`);

test.describe("홈 커플 사진 주소 기억", () => {
  test("기억한 주소를 서버가 처음 보내는 HTML에 넣고 먼저 받게 해, 화면 코드를 기다리지 않는다(#356)", async ({ page }) => {
    // Arrange: 한 번 받아 휴대폰 저장소와 쿠키에 기억한다
    const { serverUrl, path } = await openHomeAndReadPhoto(page);
    await expect.poll(async () => (await readHomePhotoCookie(page)).couple?.url).toBe(serverUrl);
    const planted = await plantRememberedUrl(page, { path: path ?? "", serverUrl, expiresAt: Date.now() + 3 * DAY_MS });

    // Act
    const tag = await readServerCouplePhotoTag(page);

    // Assert
    expect(tag).toContain(`src="${toHtmlAttribute(planted)}"`);
    expect(tag).toMatch(/\sfetchpriority="high"/i);
  });

  test("쿠키에 기억이 없는 기기(처음 켤 때, 배포 직후)는 HTML에 넣지 않고 휴대폰 저장소의 기억으로 한 번만 받는다(#356)", async ({ page }) => {
    // Arrange
    const { serverUrl, path } = await openHomeAndReadPhoto(page);
    await expect.poll(async () => (await readHomePhotoCookie(page)).couple?.url).toBe(serverUrl);
    await page.context().clearCookies({ name: HOME_PHOTO_COOKIE });
    const photoRequests: string[] = [];
    page.on("request", (request) => {
      if (isCouplePhotoRequest(request, path ?? "")) photoRequests.push(request.url());
    });

    // Act
    const tag = await readServerCouplePhotoTag(page);
    await page.reload();
    await expectImageLoaded(getCouplePhoto(page));
    await page.waitForLoadState("networkidle");

    // Assert: 저장소에 기억한 주소로 그려, 휴대폰이 저장해 둔 사진을 그대로 쓴다
    expect(tag).toBeUndefined();
    await expect(getCouplePhoto(page)).toHaveAttribute("src", serverUrl);
    expect(photoRequests.length).toBeLessThanOrEqual(1);
    expect(photoRequests.every((url) => url === serverUrl)).toBe(true);
    await expect.poll(async () => (await readHomePhotoCookie(page)).couple?.path).toBe(path);
  });

  test("쿠키에 기억한 주소로 받지 못하면 잊고 서버 주소로 다시 받는다(#356)", async ({ page }) => {
    // Arrange
    const { serverUrl, path } = await openHomeAndReadPhoto(page);
    await expect.poll(async () => (await readHomePhotoCookie(page)).couple?.url).toBe(serverUrl);
    const planted = await plantRememberedUrl(page, { path: path ?? "", serverUrl, expiresAt: Date.now() + 3 * DAY_MS, isBroken: true });

    // Act
    await page.reload();

    // Assert
    const photo = getCouplePhoto(page);
    await expect(photo).not.toHaveAttribute("src", planted);
    await expectImageLoaded(photo);
    await expect.poll(async () => (await readHomePhotoCookie(page)).couple?.url).not.toBe(planted);
    expect((await readRememberedPhotoUrls(page))[path ?? ""]?.url).not.toBe(planted);
  });

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
