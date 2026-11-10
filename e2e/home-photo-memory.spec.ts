import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { REMEMBERED_PHOTO_URLS_KEY, type RememberedUrls } from "@/lib/photos/remembered-url";
import { expectImageLoaded, getCouplePhoto } from "./support/actions";
import { PHOTO_FIXTURE_PATH } from "./support/constants";
import { expect, test } from "./support/test";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** 휴대폰이 기억한 것처럼 심어 두는 주소의 표시. 실제 서명 주소가 아니라 이 테스트가 응답을 정한다 */
const PLANTED_TOKEN = "e2e-remembered";

const readRemembered = (page: Page): Promise<RememberedUrls> =>
  page.evaluate((key) => JSON.parse(window.localStorage.getItem(key) ?? "{}") as RememberedUrls, REMEMBERED_PHOTO_URLS_KEY);

/** 홈을 열어 커플 사진을 받고, 휴대폰이 기억한 경로와 서버가 준 주소를 돌려준다 */
const openHomeAndReadPhoto = async (page: Page) => {
  await page.goto("/");
  const photo = getCouplePhoto(page);
  await expectImageLoaded(photo);
  const serverUrl = (await photo.getAttribute("src")) ?? "";
  const remembered = await readRemembered(page);
  const path = Object.keys(remembered).find((key) => remembered[key]?.url === serverUrl);
  return { photo, serverUrl, path };
};

/** 같은 경로에 다른 주소를 기억해 둔 것처럼 바꾸고, 그 주소의 응답을 `respond`로 정한다 */
const plantRememberedUrl = async (page: Page, { path, serverUrl, expiresAt, isBroken = false }: { path: string; serverUrl: string; expiresAt: number; isBroken?: boolean }) => {
  const planted = new URL(serverUrl);
  planted.searchParams.set("token", PLANTED_TOKEN);
  await page.route(
    (url) => url.searchParams.get("token") === PLANTED_TOKEN,
    (route) =>
      isBroken
        ? route.fulfill({ status: 400, json: { statusCode: "400", error: "InvalidJWT", message: '"exp" claim timestamp check failed' } })
        : route.fulfill({ status: 200, contentType: "image/jpeg", body: readFileSync(PHOTO_FIXTURE_PATH) }),
  );
  await page.evaluate(
    ({ key, entry }) => {
      const remembered = JSON.parse(window.localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
      window.localStorage.setItem(key, JSON.stringify({ ...remembered, [entry.path]: { url: entry.url, expiresAt: entry.expiresAt } }));
    },
    { key: REMEMBERED_PHOTO_URLS_KEY, entry: { path, url: planted.toString(), expiresAt } },
  );
  return planted.toString();
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
    expect((await readRemembered(page))[path ?? ""]?.url).toBe(await photo.getAttribute("src"));
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
    expect((await readRemembered(page))[path ?? ""]?.url).not.toBe(planted);
  });
});
