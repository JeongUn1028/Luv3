import type { Locator, Page, Request } from "@playwright/test";
import { expectImageLoaded, isScreenRequest } from "./support/actions";
import { PHOTO_RECORD } from "./support/constants";
import { expect, test } from "./support/test";

// 기록 상세의 사진 칸(#326). 사진을 받는 동안과 받지 못했을 때는 회색 칸을 두고, 받은 뒤에는 칸 배경 없이 사진만 보인다.
// 사진의 크기·자리는 디자인 값이라 화면 캡처로 확인하고, 여기서는 회색 칸이 사라지는 때만 고정한다

const DETAIL_PATH = `/dates/${PHOTO_RECORD.id}`;
/** `--color-surface`(#161616). 불러오는 동안의 뼈대와 같은 색이다 */
const SURFACE_COLOR = "rgb(22, 22, 22)";
const TRANSPARENT = "rgba(0, 0, 0, 0)";

/** 이 기록 사진의 서명 주소 요청 */
const isRecordPhotoRequest = (url: URL): boolean => url.pathname.includes("/storage/v1/object/sign/") && url.pathname.includes(PHOTO_RECORD.id);

const getDetailPhoto = (page: Page): Locator => page.getByRole("img", { name: `${PHOTO_RECORD.title} 사진 1` }).locator("visible=true");

/** 사진이 들어 있는 4:5 칸 */
const getPhotoFrame = (page: Page): Locator => getDetailPhoto(page).locator("..");

test("사진을 받는 동안은 회색 칸이고, 받은 뒤에는 칸 배경 없이 사진만 보인다", async ({ page }) => {
  // Arrange: 사진 요청을 붙잡아 둔다
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isRecordPhotoRequest, async (route) => {
    await released;
    await route.continue();
  });

  // Act: 붙잡은 사진 때문에 load가 오지 않으므로 응답이 오기 시작하면 넘어간다
  await page.goto(DETAIL_PATH, { waitUntil: "commit" });
  await page.getByRole("heading", { name: PHOTO_RECORD.title }).waitFor();

  // Assert: 받는 동안은 회색 칸만 보인다
  await expect(getPhotoFrame(page)).toHaveCSS("background-color", SURFACE_COLOR);
  await expect(getDetailPhoto(page)).toHaveCSS("opacity", "0");

  // Act
  release();

  // Assert: 받은 뒤에는 칸 배경이 없어 빈 곳이 앱 배경색으로 보인다
  await expectImageLoaded(getDetailPhoto(page));
  await expect(getPhotoFrame(page)).toHaveCSS("background-color", TRANSPARENT);
  await expect(getDetailPhoto(page)).toHaveCSS("opacity", "1");
});

test("칸보다 작은 사진도 칸 폭에 맞게 키운다", async ({ page }) => {
  // Arrange: 업로드는 사진을 키우지 않아 작은 원본은 작게 남는다. 40×30(4:3) 사진으로 바꿔 보낸다
  await page.route(isRecordPhotoRequest, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="#f5cfd9"/></svg>' }),
  );

  // Act
  await page.goto(DETAIL_PATH);
  await expectImageLoaded(getDetailPhoto(page));

  // Assert: 가로 사진은 칸 폭을 채우고 높이는 사진 비율대로다
  await expect(getPhotoFrame(page)).toHaveCSS("background-color", TRANSPARENT);
  const frame = await getPhotoFrame(page).boundingBox();
  const photo = await getDetailPhoto(page).boundingBox();
  expect(photo?.width).toBeCloseTo(frame?.width ?? 0, 0);
  expect(photo?.height).toBeCloseTo(((frame?.width ?? 0) * 3) / 4, 0);
});

test("사진을 받지 못하면 회색 칸으로 남는다", async ({ page }) => {
  // Arrange: 화면을 새로 받아 다시 받아도 계속 거절한다
  await page.route(isRecordPhotoRequest, (route) => route.fulfill({ status: 400, json: { statusCode: "400", error: "InvalidJWT" } }));
  const refresh = page.waitForRequest((request: Request) => isScreenRequest(request, DETAIL_PATH));

  // Act
  await page.goto(DETAIL_PATH);
  await refresh;
  await page.waitForLoadState("networkidle");

  // Assert: 깨진 사진 표시 대신 회색 칸이 남는다
  await expect(getPhotoFrame(page)).toHaveCSS("background-color", SURFACE_COLOR);
  await expect(getDetailPhoto(page)).toHaveCSS("opacity", "0");
});

test("화면이 연결되기 전에 받은 사진도 연결된 뒤 칸 배경이 없어진다", async ({ page }) => {
  // Arrange: 앱 스크립트를 사진을 다 받을 때까지 붙잡아, 사진의 load 알림이 화면 연결보다 먼저 지나가게 한다
  // 사진 요청이 없거나 주소가 바뀌어 못 찾으면, 스크립트를 놓아주고 아래 확인에서 바로 실패하게 한다(시간 초과로만 끝나지 않게)
  const photoLoaded = page
    .waitForEvent("requestfinished", { predicate: (request) => isRecordPhotoRequest(new URL(request.url())), timeout: 10_000 })
    .catch(() => undefined);
  await page.route(
    (url) => url.pathname.startsWith("/_next/static/") && url.pathname.endsWith(".js"),
    async (route) => {
      await photoLoaded;
      await route.continue();
    },
  );

  // Act: 스크립트를 기다리면 load가 오지 않으므로 응답이 오기 시작하면 넘어간다
  await page.goto(DETAIL_PATH, { waitUntil: "commit" });

  // Assert
  await expectImageLoaded(getDetailPhoto(page));
  await expect(getPhotoFrame(page)).toHaveCSS("background-color", TRANSPARENT);
  await expect(getDetailPhoto(page)).toHaveCSS("opacity", "1");
});
