import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { createDisposableRecord, deleteRecordWithFiles, getRecordIdsByTitle, getRecordPhotoLocations, setRecordPhotoLocation } from "./support/seed";
import { getSaveButton, pickPhoto } from "./support/actions";
import { MODAL_OPEN_GUARD_WAIT_MS } from "./support/constants";
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
