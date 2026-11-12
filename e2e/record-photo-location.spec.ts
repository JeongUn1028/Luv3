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
  addRecordPhoto,
  setRecordPhotoLocation,
} from "./support/seed";
import { getGroupPhoto, getSaveButton, getSubmitButton, PICKED_PHOTO_LOCATION, pickPhoto } from "./support/actions";
import { fakeMapSdk } from "./support/fake-kakao-map";
import { MODAL_OPEN_GUARD_WAIT_MS, PHOTO_FIXTURE_PATH } from "./support/constants";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

const FOREST = { name: "서울숲", lat: 37.5444, lng: 127.0374 };
/** 서버가 리포의 행정동 경계로 "성동구 성수1가1동"을 돌려주는 자리 */
const SEONGSU = { lat: 37.5444, lng: 127.0396 };
const SEONGSU_NAME = "성동구 성수1가1동";
/** 행정동 경계 밖(해외)이라 서버가 이름 없이 돌려주는 자리 */
const PARIS = { lat: 48.8584, lng: 2.2945 };

/**
 * 사진 정보(GPS·찍은 시각)를 넣은 테스트 사진을 고르고, 폼의 사진이 모두 `order`장이 될 때까지 기다린다.
 * 기본으로 새 모음을 만들고, `groupNumber`를 주면 그 모음에 더한다. 실제 사진·위치는 공개 리포에 두지 않는다
 */
const pickPhotoWithExif = async (page: Page, order: number, fields: ExifFields, { groupNumber }: { groupNumber?: number } = {}): Promise<void> => {
  const buffer = Buffer.from(withJpegExif(fields, readFileSync(PHOTO_FIXTURE_PATH)));
  const input = groupNumber ? page.getByLabel(`모음 ${groupNumber}에 더할 사진 고르기`) : page.getByLabel("사진 고르기", { exact: true });
  await input.setInputFiles({ name: "exif.jpg", mimeType: "image/jpeg", buffer });
  await expect(page.getByRole("button", { name: /^모음 \d+의 \d+번째 사진/ }).locator("visible=true")).toHaveCount(order);
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

/** 모음 카드. 이름은 "모음 N M장"이다 */
const getGroupCard = (page: Page, groupNumber: number): Locator =>
  page.getByRole("listitem", { name: new RegExp(`^모음 ${groupNumber} `) }).locator("visible=true");

/** 모음 카드의 위치 줄. 글자는 "모음 N 위치: <동네 이름 또는 위치 없음>"이다 */
const getGroupLocation = (page: Page, groupNumber: number): Locator =>
  page.locator("p").filter({ hasText: `모음 ${groupNumber} 위치:` }).locator("visible=true");

/** 모음 카드의 위치 버튼. 위치가 있으면 "위치 바꾸기", 없으면 "지도에서 고르기"다 */
const getLocationButton = (page: Page, groupNumber: number): Locator =>
  page.getByRole("button", { name: new RegExp(`\\(모음 ${groupNumber}\\)$`) }).locator("visible=true");

/** 위치 버튼을 눌러 지도 창을 연다. 창은 두 번 누르기를 막으려고 열린 직후 잠깐 누름을 받지 않으므로 그 시간을 기다린다 */
const openLocationDialog = async (page: Page, groupNumber: number): Promise<Locator> => {
  await getLocationButton(page, groupNumber).click();
  const dialog = page.getByRole("dialog", { name: `모음 ${groupNumber} 위치 고르기` });
  await dialog.waitFor();
  await page.waitForTimeout(MODAL_OPEN_GUARD_WAIT_MS);
  return dialog;
};

/** 가짜 지도의 가운데를 옮기고 지도가 멈춘 것처럼 알린다(사용자가 지도를 끌어 옮긴 것과 같다) */
const moveMapCenter = (page: Page, location: { lat: number; lng: number }): Promise<void> =>
  page.evaluate(({ lat, lng }) => {
    const fake = window as unknown as {
      kakao: { maps: { LatLng: new (lat: number, lng: number) => unknown } };
      fakeMap: { map: { setCenter: (latLng: unknown) => void }; idle: () => void };
    };
    fake.fakeMap.map.setCenter(new fake.kakao.maps.LatLng(lat, lng));
    fake.fakeMap.idle();
  }, location);

test.describe("모음 위치", () => {
  test("첫 사진에 위치가 없는 모음은 저장 때 지도에서 고르기로 초점이 가고, 다른 모음과 같은 곳으로 골라 저장한다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 모음 위치", testInfo);
    const region = await holdPlaceRegion(page, { json: { name: SEONGSU_NAME } });
    region.release();
    await fakeMapSdk(page);
    await openScreen(page, "/dates/new", page.locator("#memo"));

    try {
      await page.locator("#title").fill(title);
      await pickPhoto(page, 1);
      await pickPhoto(page, 2, { hasLocation: false });
      await expect(getGroupLocation(page, 1)).toHaveText(`모음 1 위치: ${SEONGSU_NAME}`);
      await expect(getGroupCard(page, 1).getByText("첫 사진 정보에서 읽었어요")).toBeVisible();
      await expect(getGroupLocation(page, 2)).toHaveText("모음 2 위치: 위치 없음");
      await expect(getGroupCard(page, 2).getByText("첫 사진에 위치 정보가 없어요")).toBeVisible();

      // Act
      await getSaveButton(page).click();

      // Assert: 저장하지 않고 위치가 없는 모음의 버튼으로 초점이 간다
      const pickButton = getLocationButton(page, 2);
      await expect(pickButton).toBeFocused();
      await expect(pickButton).toHaveAccessibleName("지도에서 고르기 (모음 2)");
      await expect(pickButton).toHaveAccessibleDescription("위치를 골라야 저장할 수 있어요.");
      await expect(page).toHaveURL(/\/dates\/new$/);

      // Act
      const dialog = await openLocationDialog(page, 2);
      await dialog.getByRole("button", { name: /^모음 1과 같은 곳/ }).click();

      // Assert: 창이 닫히고 같은 버튼으로 초점이 돌아오며 오류가 사라진다
      await expect(dialog).toBeHidden();
      await expect(getGroupLocation(page, 2)).toHaveText(`모음 2 위치: ${SEONGSU_NAME}`);
      await expect(getGroupCard(page, 2).getByText("직접 골랐어요")).toBeVisible();
      await expect(getLocationButton(page, 2)).toBeFocused();
      await expect(page.getByText("위치를 골라야 저장할 수 있어요.")).toHaveCount(0);

      // Act
      await getSaveButton(page).click();
      await page.waitForURL(/\/records/);

      // Assert
      const [id] = await getRecordIdsByTitle(title);
      const locations = await getRecordPhotoLocations(id ?? "");
      expect(locations.map(({ place }) => place)).toEqual([SEONGSU_NAME, SEONGSU_NAME]);
      expect(locations[1]?.place_lat).toBeCloseTo(PICKED_PHOTO_LOCATION.lat, 5);
      expect(locations[1]?.place_lng).toBeCloseTo(PICKED_PHOTO_LOCATION.lng, 5);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  // 동네 이름은 가짜 응답 없이 서버가 리포의 행정동 경계로 계산한다
  test("지도를 옮기거나 내 위치로 가면 가운데 핀 자리의 동네 이름을 보여 주고, 이 위치로를 누르면 그 자리로 저장한다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 지도에서 고르기", testInfo);
    await fakeMapSdk(page);
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: SEONGSU.lat, longitude: SEONGSU.lng });
    await openScreen(page, "/dates/new", page.locator("#memo"));

    try {
      await page.locator("#title").fill(title);
      await pickPhoto(page, 1, { hasLocation: false });
      const dialog = await openLocationDialog(page, 1);
      const choose = dialog.getByRole("button", { name: "이 위치로" });
      // 카카오 장소 찾기 결과는 저장할 수 없어 찾기를 없앴다(#296)
      await expect(dialog.getByRole("textbox")).toHaveCount(0);

      // Act: 경계 밖으로 옮긴다
      await moveMapCenter(page, PARIS);

      // Assert: 이름을 받지 못해도 좌표는 쓸 수 있어 "찍은 곳"으로 보인다
      await expect(dialog.getByText("찍은 곳", { exact: true })).toBeVisible();
      await expect(choose).toBeEnabled();

      // Act
      await dialog.getByRole("button", { name: "내 위치로" }).click();

      // Assert
      await expect(dialog.getByText(SEONGSU_NAME, { exact: true })).toBeVisible();

      // Act
      await choose.click();

      // Assert
      await expect(dialog).toBeHidden();
      await expect(getGroupLocation(page, 1)).toHaveText(`모음 1 위치: ${SEONGSU_NAME}`);
      await expect(getLocationButton(page, 1)).toHaveAccessibleName("위치 바꾸기 (모음 1)");
      await expect(getLocationButton(page, 1)).toBeFocused();

      // Act
      await getSaveButton(page).click();
      await page.waitForURL(/\/records/);

      // Assert
      const [id] = await getRecordIdsByTitle(title);
      const [location] = await getRecordPhotoLocations(id ?? "");
      expect(location?.place).toBe(SEONGSU_NAME);
      expect(location?.place_lat).toBeCloseTo(SEONGSU.lat, 5);
      expect(location?.place_lng).toBeCloseTo(SEONGSU.lng, 5);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("위치 오류가 난 모음의 마지막 사진을 빼 모음이 사라지면 폼 안내도 사라진다", async ({ page }) => {
    // Arrange: 위치 없는 모음 2를 둔 채 저장해 오류를 낸다
    const region = await holdPlaceRegion(page, { json: { name: SEONGSU_NAME } });
    region.release();
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await page.locator("#title").fill("위치 오류 모음 빼기");
    await pickPhoto(page, 1);
    await pickPhoto(page, 2, { hasLocation: false });
    await getSaveButton(page).click();
    const alert = page.locator("main form").getByRole("alert").locator("visible=true");
    await expect(alert).toHaveText("입력한 내용을 확인해 주세요.");

    // Act
    await getGroupPhoto(page, 2, 1).click();
    await page.getByRole("button", { name: "이 사진 빼기" }).locator("visible=true").click();

    // Assert
    await expect(getGroupCard(page, 2)).toHaveCount(0);
    await expect(alert).toBeHidden();
  });

  test("이름을 찾는 사이 이미 이름을 받은 자리로 돌아오면, 늦게 온 다른 자리의 이름으로 바뀌지 않고 이 위치로를 누를 수 있다", async ({ page }) => {
    // Arrange: 성수 이름은 바로 주고, 파리 이름은 붙잡아 둔다
    let releaseParis = (): void => undefined;
    const parisHeld = new Promise<void>((resolve) => {
      releaseParis = resolve;
    });
    let parisRequested = false;
    await page.route("**/api/places/region*", async (route) => {
      const lat = Number(new URL(route.request().url()).searchParams.get("lat"));
      if (Math.abs(lat - PARIS.lat) < 0.001) {
        parisRequested = true;
        await parisHeld;
        await route.fulfill({ json: { name: "파리 어딘가" } });
        return;
      }
      await route.fulfill({ json: { name: SEONGSU_NAME } });
    });
    await fakeMapSdk(page);
    await page.context().grantPermissions(["geolocation"]);
    await page.context().setGeolocation({ latitude: SEONGSU.lat, longitude: SEONGSU.lng });
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await pickPhoto(page, 1, { hasLocation: false });
    const dialog = await openLocationDialog(page, 1);
    const myLocation = dialog.getByRole("button", { name: "내 위치로" });
    await myLocation.click();
    await expect(dialog.getByText(SEONGSU_NAME, { exact: true })).toBeVisible();

    // Act: 파리로 옮겨 이름을 기다리는 사이 내 위치(성수)로 돌아온 뒤, 파리 이름이 늦게 온다
    await moveMapCenter(page, PARIS);
    await expect.poll(() => parisRequested).toBe(true);
    await myLocation.click();
    await expect(dialog.getByText(SEONGSU_NAME, { exact: true })).toBeVisible();
    releaseParis();

    // Assert
    await page.waitForTimeout(300);
    await expect(dialog.getByText(SEONGSU_NAME, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "이 위치로" })).toBeEnabled();
  });

  test("고치기에서 저장된 모음 위치로 지도 창을 열고, 닫으면 위치 버튼으로 초점이 돌아온다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 모음 위치 창" });
    await setRecordPhotoLocation(id, { place: FOREST.name, lat: FOREST.lat, lng: FOREST.lng });
    await fakeMapSdk(page);

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));
      await expect(getGroupLocation(page, 1)).toHaveText(`모음 1 위치: ${FOREST.name}`);

      // Act
      const dialog = await openLocationDialog(page, 1);

      // Assert: 저장된 이름을 다시 찾지 않고 그대로 보여 준다
      await expect(dialog.getByText(FOREST.name, { exact: true })).toBeVisible();
      expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);

      // Act
      await dialog.getByRole("button", { name: "닫기" }).click();

      // Assert
      await expect(dialog).toBeHidden();
      await expect(getLocationButton(page, 1)).toBeFocused();
    } finally {
      await deleteRecord();
    }
  });

  test("새 모음은 첫 사진의 찍은 시각 순서로 자리를 잡는다", async ({ page }) => {
    // Arrange: 15시에 찍은 사진 두 장인 모음
    const region = await holdPlaceRegion(page, { json: { name: SEONGSU_NAME } });
    region.release();
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await pickPhotoWithExif(page, 1, { ...SEONGSU, dateTimeOriginal: "2026:11:10 15:00:00", offsetTimeOriginal: "+09:00" });
    await pickPhoto(page, 2, { groupNumber: 1 });

    // Act: 13시에 찍은 사진으로 새 모음을 만든다
    await pickPhotoWithExif(page, 3, { ...SEONGSU, dateTimeOriginal: "2026:11:10 13:00:00", offsetTimeOriginal: "+09:00" });

    // Assert: 나중에 고른 모음이 앞으로 온다
    await expect(page.getByRole("heading", { name: "모음 1 1장" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "모음 2 2장" })).toBeVisible();
  });
});

test.describe("사진 정보로 위치·찍은 시각 채우기", () => {
  test("GPS가 있는 사진을 고르면 읽는 동안 저장을 막고, 동네 이름으로 모음 위치를 채워 찍은 시각과 함께 저장하며 올린 파일에는 위치를 남기지 않는다", async ({
    page,
  }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 사진 정보", testInfo);
    const region = await holdPlaceRegion(page, { json: { name: SEONGSU_NAME } });
    await openScreen(page, "/dates/new", page.locator("#memo"));

    try {
      await page.locator("#title").fill(title);

      // Act
      await pickPhotoWithExif(page, 1, { ...SEONGSU, dateTimeOriginal: "2026:11:10 14:03:22", offsetTimeOriginal: "+09:00" });

      // Assert: 동네 이름이 오기 전에는 위치 버튼과 저장을 누를 수 없다
      await expect(getGroupLocation(page, 1)).toHaveText("모음 1 위치: 위치 읽는 중…");
      await expect(getLocationButton(page, 1)).toBeDisabled();
      await expect(getSubmitButton(page)).toHaveText("사진 정보 읽는 중…");
      await expect(getSubmitButton(page)).toBeDisabled();

      // Act
      region.release();

      // Assert
      await expect(getGroupLocation(page, 1)).toHaveText(`모음 1 위치: ${SEONGSU_NAME}`);
      expect(region.requests).toHaveLength(1);
      expect(Number(region.requests[0]?.lat)).toBeCloseTo(SEONGSU.lat, 5);
      expect(Number(region.requests[0]?.lng)).toBeCloseTo(SEONGSU.lng, 5);

      // Act
      await getSaveButton(page).click();
      await page.waitForURL(/\/records/);

      // Assert
      const [id] = await getRecordIdsByTitle(title);
      const [photo] = await getRecordPhotoDetails(id ?? "");
      expect(photo?.place).toBe(SEONGSU_NAME);
      expect(photo?.place_lat).toBeCloseTo(SEONGSU.lat, 5);
      expect(photo?.place_lng).toBeCloseTo(SEONGSU.lng, 5);
      expect(new Date(photo?.taken_at ?? "").toISOString()).toBe("2026-11-10T05:03:22.000Z");
      const uploaded: unknown = await exifr.parse(await downloadAlbumFile(photo?.path ?? ""), { gps: true });
      expect(uploaded).toBeUndefined();
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("동네 이름을 받지 못하면 좌표를 '찍은 곳'으로 지키고, 같은 모음에 더한 GPS 없는 사진은 이름을 묻지 않고 그 모음 위치로 저장한다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 사진 정보 실패", testInfo);
    const region = await holdPlaceRegion(page, { status: 502, json: { code: "PLACE_REGION_FAILED", message: "실패" } });
    region.release();
    await openScreen(page, "/dates/new", page.locator("#memo"));

    try {
      await page.locator("#title").fill(title);

      // Act
      await pickPhotoWithExif(page, 1, PARIS);
      await pickPhoto(page, 2, { hasLocation: false, groupNumber: 1 });

      // Assert
      await expect(getGroupLocation(page, 1)).toHaveText("모음 1 위치: 찍은 곳");
      expect(region.requests).toHaveLength(1);

      // Act
      await getSaveButton(page).click();
      await page.waitForURL(/\/records/);

      // Assert
      const [id] = await getRecordIdsByTitle(title);
      const photos = await getRecordPhotoDetails(id ?? "");
      expect(photos.map(({ place, taken_at }) => ({ place, taken_at }))).toEqual([
        { place: "찍은 곳", taken_at: null },
        { place: "찍은 곳", taken_at: null },
      ]);
      expect(photos[0]?.place_lat).toBeCloseTo(PARIS.lat, 5);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  // 아이폰은 HEIC를 받는다고 알린 사진 칸에 원본 HEIC를 넘긴다. JPEG로 바꾸면 사진 정보가 사라지므로 바꾸기 전 원본에서 읽는다
  // 동네 이름은 가짜 응답 없이 서버가 리포의 행정동 경계로 계산한다. 경계 파일이 빌드에 실렸는지도 함께 본다
  test("아이폰 HEIC 원본을 고르면 그 사진 정보로 모음 위치를 채우고, 동네 이름은 서버가 행정동 경계로 계산한다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/dates/new", page.locator("#memo"));

    // Act
    const buffer = Buffer.from(buildHeicWithExif({ ...SEONGSU, dateTimeOriginal: "2026:11:10 14:03:22" }));
    await page.getByLabel("사진 고르기", { exact: true }).setInputFiles({ name: "IMG_0001.HEIC", mimeType: "image/heic", buffer });

    // Assert
    await expect(getGroupLocation(page, 1)).toHaveText(`모음 1 위치: ${SEONGSU_NAME}`);
  });
});

test.describe("기록 상세의 사진별 장소", () => {
  test("사진을 지정한 주소로 열면 그 사진부터 보이고, 한마디 아래에 그 사진의 장소가 나온다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 사진별 장소" });
    const carousel = page.getByRole("region", { name: "사진" });

    try {
      const secondPhotoId = await addRecordPhoto(id, { sortOrder: 1, caption: "창가 자리", location: { place: FOREST.name, lat: FOREST.lat, lng: FOREST.lng } });

      // Act
      await openScreen(page, `/dates/${id}?photo=${secondPhotoId}`, page.getByRole("heading", { name: "E2E 사진별 장소" }));

      // Assert
      await expect(carousel.getByText("2 / 2")).toBeVisible();
      await expect(carousel.getByText("창가 자리")).toBeVisible();
      await expect(carousel.getByText(FOREST.name)).toBeVisible();

      // Act: 장소가 없는 첫 사진으로 넘기면 장소 줄이 없다
      await carousel.getByRole("button", { name: "이전 사진" }).click();

      // Assert
      await expect(carousel.getByText("1 / 2")).toBeVisible();
      await expect(carousel.getByText(FOREST.name)).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });
});
