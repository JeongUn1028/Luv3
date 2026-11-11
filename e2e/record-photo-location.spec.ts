import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import * as exifr from "exifr/dist/lite.esm.mjs";
import { buildHeicWithExif, withJpegExif, type ExifFields } from "@/test-utils/exif-image";
import {
  createDisposableRecord,
  deleteRecordWithFiles,
  downloadAlbumFile,
  getRecordIdsByTitle,
  getRecordPhotoDetails,
  getRecordPhotoLocations,
  setRecordPhotoLocation,
} from "./support/seed";
import { getSaveButton, getSubmitButton, pickPhoto } from "./support/actions";
import { MODAL_OPEN_GUARD_WAIT_MS, PHOTO_FIXTURE_PATH } from "./support/constants";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

const ONION = { id: "1", name: "어니언 성수", address: "서울 성동구 아차산로9길 8", lat: 37.5447, lng: 127.0582 };
const FOREST = { id: "2", name: "서울숲", address: "서울 성동구 뚝섬로 273", lat: 37.5444, lng: 127.0374 };

/** 실제 카카오를 부르지 않게 우리 API의 응답을 정해 둔다. 받은 검색어를 돌려준다 */
const fakePlaceSearch = async (page: Page, items: (typeof ONION)[]): Promise<string[]> => {
  const queries: string[] = [];
  await page.route("**/api/places/search*", async (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    await route.fulfill({ json: { items } });
  });
  return queries;
};

/** 사진 정보(GPS·찍은 시각)를 넣은 테스트 사진을 고른다. 실제 사진·위치는 공개 리포에 두지 않는다 */
const pickPhotoWithExif = async (page: Page, order: number, fields: ExifFields): Promise<void> => {
  const buffer = Buffer.from(withJpegExif(fields, readFileSync(PHOTO_FIXTURE_PATH)));
  await page.getByLabel("사진 고르기").setInputFiles({ name: "exif.jpg", mimeType: "image/jpeg", buffer });
  await page.getByRole("button", { name: `${order}번째 사진 빼기` }).waitFor();
};

/** 좌표 → 동네 이름 API를 붙잡아 둔다. `release`를 부르면 정해 둔 응답을 보낸다. 받은 좌표를 `requests`에 남긴다 */
const holdPlaceRegion = async (page: Page, respond: { json: unknown; status?: number }) => {
  const requests: { lat: string | null; lng: string | null }[] = [];
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/places/region*", async (route) => {
    const params = new URL(route.request().url()).searchParams;
    requests.push({ lat: params.get("lat"), lng: params.get("lng") });
    await released;
    await route.fulfill(respond);
  });
  return { requests, release };
};

/** 사진 줄의 위치 버튼. 이름은 "N번째 사진 위치: <장소 또는 위치 추가>"다 */
const getLocationButton = (page: Page, order: number): Locator => page.getByRole("button", { name: new RegExp(`^${order}번째 사진 위치:`) });

const getLocationDialog = (page: Page, order: number): Locator => page.getByRole("dialog", { name: `${order}번째 사진 위치` });

/** 사진 줄의 위치 버튼을 눌러 창을 연다. 창은 두 번 누르기를 막으려고 열린 직후 잠깐 누름을 받지 않으므로 그 시간을 기다린다 */
const openLocationDialog = async (page: Page, order: number): Promise<Locator> => {
  await getLocationButton(page, order).click();
  const dialog = getLocationDialog(page, order);
  await dialog.waitFor();
  await page.waitForTimeout(MODAL_OPEN_GUARD_WAIT_MS);
  return dialog;
};

const getQueryInput = (dialog: Locator): Locator => dialog.getByRole("textbox", { name: "장소 찾기" });

const searchInDialog = async (dialog: Locator, query: string): Promise<void> => {
  await getQueryInput(dialog).fill(query);
  await dialog.getByRole("button", { name: "사진 장소 찾기" }).click();
};

test.describe("사진마다 위치", () => {
  test("새 기록에서 사진 위치를 찾아 고르고, 다음 사진은 앞 사진과 같은 곳으로 두어 저장한다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 사진 위치", testInfo);
    const queries = await fakePlaceSearch(page, [ONION, FOREST]);
    await openScreen(page, "/dates/new", page.locator("#memo"));

    try {
      await pickPhoto(page, 1);
      await pickPhoto(page, 2);
      await page.locator("#title").fill(title);
      await expect(getLocationButton(page, 1)).toHaveAccessibleName("1번째 사진 위치: 위치 추가");

      // Act: 첫 사진은 찾아서 고른다
      const firstDialog = await openLocationDialog(page, 1);
      await expect(firstDialog.getByRole("button", { name: /앞 사진과 같은 곳/ })).toHaveCount(0);
      await searchInDialog(firstDialog, "어니언");
      await firstDialog.getByRole("button", { name: /어니언 성수/ }).click();

      // Assert
      expect(queries).toEqual(["어니언"]);
      await expect(firstDialog).toBeHidden();
      await expect(getLocationButton(page, 1)).toHaveAccessibleName("1번째 사진 위치: 어니언 성수");

      // Act: 두 번째 사진은 앞 사진과 같은 곳
      await (await openLocationDialog(page, 2)).getByRole("button", { name: /앞 사진과 같은 곳/ }).click();
      await expect(getLocationButton(page, 2)).toHaveAccessibleName("2번째 사진 위치: 어니언 성수");
      await getSaveButton(page).click();
      await page.waitForURL(/\/records/);

      // Assert
      const [id] = await getRecordIdsByTitle(title);
      const saved = { place: ONION.name, place_lat: ONION.lat, place_lng: ONION.lng };
      expect(await getRecordPhotoLocations(id ?? "")).toEqual([saved, saved]);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  // 아이폰은 창이 열리며 찾기 칸에 초점이 가면 키보드를 올려 "앞 사진과 같은 곳"을 가린다. 찾을 때만 칸을 누르게 한다
  test("위치 창을 열어도 찾기 칸에 바로 초점이 가지 않는다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 사진 위치 초점" });

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));

      // Act
      const dialog = await openLocationDialog(page, 1);

      // Assert
      await expect(getQueryInput(dialog)).not.toBeFocused();
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    } finally {
      await deleteRecord();
    }
  });

  test("고치기에서 사진 위치를 지우면 저장 뒤 위치가 없다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 사진 위치 지우기" });
    await setRecordPhotoLocation(id, { place: FOREST.name, lat: FOREST.lat, lng: FOREST.lng });

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));
      await expect(getLocationButton(page, 1)).toHaveAccessibleName("1번째 사진 위치: 서울숲");

      // Act
      const dialog = await openLocationDialog(page, 1);
      await expect(dialog.getByText("지금: 서울숲")).toBeVisible();
      await dialog.getByRole("button", { name: "위치 지우기" }).click();
      await expect(getLocationButton(page, 1)).toHaveAccessibleName("1번째 사진 위치: 위치 추가");
      await getSaveButton(page).click();
      await page.waitForURL(new RegExp(`/dates/${id}$`));

      // Assert
      expect(await getRecordPhotoLocations(id)).toEqual([{ place: null, place_lat: null, place_lng: null }]);
    } finally {
      await deleteRecord();
    }
  });

  test("창의 찾기 칸에서 Enter를 누르면 기록을 저장하지 않고 장소를 찾으며, 닫으면 위치 버튼으로 초점이 돌아온다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 사진 위치 엔터" });
    const queries = await fakePlaceSearch(page, [ONION]);

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));
      const dialog = await openLocationDialog(page, 1);

      // Act
      await getQueryInput(dialog).fill("어니언");
      await getQueryInput(dialog).press("Enter");

      // Assert
      await expect(dialog.getByRole("list", { name: "찾은 사진 장소" })).toBeVisible();
      expect(queries).toEqual(["어니언"]);
      expect(new URL(page.url()).pathname).toBe(`/dates/${id}/edit`);

      // Act
      await dialog.getByRole("button", { name: "닫기" }).click();

      // Assert: 다시 열면 찾던 내용이 남아 있지 않다
      await expect(dialog).toBeHidden();
      await expect(getLocationButton(page, 1)).toBeFocused();
      await openLocationDialog(page, 1);
      await expect(getQueryInput(dialog)).toHaveValue("");
      await expect(dialog.getByRole("list", { name: "찾은 사진 장소" })).toHaveCount(0);
      expect(await getRecordPhotoLocations(id)).toEqual([{ place: null, place_lat: null, place_lng: null }]);
    } finally {
      await deleteRecord();
    }
  });
});

test.describe("사진 정보로 위치·찍은 시각 채우기", () => {
  const SEONGSU = { lat: 37.5444, lng: 127.0396 };

  test("GPS가 있는 사진을 고르면 읽는 동안 저장을 막고, 동네 이름으로 위치를 채워 찍은 시각과 함께 저장하며 올린 파일에는 위치를 남기지 않는다", async ({
    page,
  }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 사진 정보", testInfo);
    const region = await holdPlaceRegion(page, { json: { name: "성동구 성수1가1동" } });
    await openScreen(page, "/dates/new", page.locator("#memo"));

    try {
      await page.locator("#title").fill(title);

      // Act
      await pickPhotoWithExif(page, 1, { ...SEONGSU, dateTimeOriginal: "2026:11:10 14:03:22", offsetTimeOriginal: "+09:00" });

      // Assert: 동네 이름이 오기 전에는 위치 칸과 저장을 누를 수 없다
      await expect(getLocationButton(page, 1)).toHaveAccessibleName("1번째 사진 위치: 위치 읽는 중…");
      await expect(getLocationButton(page, 1)).toBeDisabled();
      await expect(getSubmitButton(page)).toHaveText("사진 정보 읽는 중…");
      await expect(getSubmitButton(page)).toBeDisabled();

      // Act
      region.release();

      // Assert
      await expect(getLocationButton(page, 1)).toHaveAccessibleName("1번째 사진 위치: 성동구 성수1가1동");
      expect(region.requests).toHaveLength(1);
      expect(Number(region.requests[0]?.lat)).toBeCloseTo(SEONGSU.lat, 5);
      expect(Number(region.requests[0]?.lng)).toBeCloseTo(SEONGSU.lng, 5);

      // Act
      await getSaveButton(page).click();
      await page.waitForURL(/\/records/);

      // Assert
      const [id] = await getRecordIdsByTitle(title);
      const [photo] = await getRecordPhotoDetails(id ?? "");
      expect(photo?.place).toBe("성동구 성수1가1동");
      expect(photo?.place_lat).toBeCloseTo(SEONGSU.lat, 5);
      expect(photo?.place_lng).toBeCloseTo(SEONGSU.lng, 5);
      expect(new Date(photo?.taken_at ?? "").toISOString()).toBe("2026-11-10T05:03:22.000Z");
      const uploaded: unknown = await exifr.parse(await downloadAlbumFile(photo?.path ?? ""), { gps: true });
      expect(uploaded).toBeUndefined();
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("동네 이름을 받지 못하면 좌표를 '찍은 곳'으로 지키고, GPS가 없는 사진은 위치를 비운 채 이름을 묻지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 사진 정보 실패", testInfo);
    const region = await holdPlaceRegion(page, { status: 502, json: { code: "PLACE_REGION_FAILED", message: "실패" } });
    region.release();
    await openScreen(page, "/dates/new", page.locator("#memo"));

    try {
      await page.locator("#title").fill(title);

      // Act
      await pickPhotoWithExif(page, 1, { lat: 48.8584, lng: 2.2945 });
      await pickPhoto(page, 2);

      // Assert
      await expect(getLocationButton(page, 1)).toHaveAccessibleName("1번째 사진 위치: 찍은 곳");
      await expect(getLocationButton(page, 2)).toHaveAccessibleName("2번째 사진 위치: 위치 추가");
      expect(region.requests).toHaveLength(1);

      // Act
      await getSaveButton(page).click();
      await page.waitForURL(/\/records/);

      // Assert
      const [id] = await getRecordIdsByTitle(title);
      const photos = await getRecordPhotoDetails(id ?? "");
      expect(photos.map(({ place, taken_at }) => ({ place, taken_at }))).toEqual([
        { place: "찍은 곳", taken_at: null },
        { place: null, taken_at: null },
      ]);
      expect(photos[0]?.place_lat).toBeCloseTo(48.8584, 5);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  // 아이폰은 HEIC를 받는다고 알린 사진 칸에 원본 HEIC를 넘긴다. JPEG로 바꾸면 사진 정보가 사라지므로 바꾸기 전 원본에서 읽는다
  // 동네 이름은 가짜 응답 없이 서버가 리포의 행정동 경계로 계산한다. 경계 파일이 빌드에 실렸는지도 함께 본다
  test("아이폰 HEIC 원본을 고르면 그 사진 정보로 위치를 채우고, 동네 이름은 서버가 행정동 경계로 계산한다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/dates/new", page.locator("#memo"));

    // Act
    const buffer = Buffer.from(buildHeicWithExif({ ...SEONGSU, dateTimeOriginal: "2026:11:10 14:03:22" }));
    await page.getByLabel("사진 고르기").setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer });

    // Assert
    await expect(getLocationButton(page, 1)).toHaveAccessibleName("1번째 사진 위치: 성동구 성수1가1동");
  });
});
