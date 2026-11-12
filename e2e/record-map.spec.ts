import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { RECORDS_MAP_PATH } from "@/lib/dates/map";
import { createUniqueLocation, fakeMapSdk, KAKAO_SDK_URL, toViewBoxAround, type FakeWindow } from "./support/fake-kakao-map";
import { createDisposableRecord, setRecordPhotoLocation } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

/** 사진 1장짜리 일회용 기록을 만들고 그 사진에 위치를 넣는다. 지도의 핀은 사진 위치로만 그린다(#296) */
const createPinnedRecord = async ({ title, place, lat, lng }: { title: string; place: string; lat: number; lng: number }): Promise<{ id: string; remove: () => Promise<void> }> => {
  const id = randomUUID();
  const remove = await createDisposableRecord({ id, title });
  await setRecordPhotoLocation(id, { place, lat, lng });
  return { id, remove };
};

const openMap = async (page: Page): Promise<void> => {
  await openScreen(page, RECORDS_MAP_PATH, page.getByRole("heading", { name: "지도" }));
};

const getFakeMapCounts = (page: Page): Promise<{ mapCount: number; boundsCount: number; centerCount: number }> =>
  page.evaluate(() => {
    const { mapCount, boundsCount, centerCount } = (window as unknown as FakeWindow).fakeMap;
    return { mapCount, boundsCount, centerCount };
  });

/** 지도 위 사진 핀. 같은 이름의 스크린 리더용 목록 버튼은 글자로 이름을 가져 aria-label로만 고른다 */
const getPhotoPin = (page: Page, place: string): Locator => page.getByLabel(`${place} 사진 1장`, { exact: true });

test.describe("기록 지도", () => {
  test("기록 탭의 지도 버튼을 누르면 지도 화면이 열리고, 버튼은 44px 넘게 눌린다", async ({ page }) => {
    // Arrange
    await fakeMapSdk(page);
    await openScreen(page, "/records", page.getByRole("link", { name: "지도로 보기" }));
    const mapLink = page.getByRole("link", { name: "지도로 보기" });
    const box = await mapLink.boundingBox();

    // Act
    await mapLink.click();

    // Assert
    await page.waitForURL(`**${RECORDS_MAP_PATH}`);
    await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();
    expect(box?.height).toBeGreaterThanOrEqual(44);
    expect(box?.width).toBeGreaterThanOrEqual(44);
  });

  test("상세에서 뒤로 돌아오면 지도를 새로 만들지 않아 보던 자리를 지킨다", async ({ page }) => {
    // Arrange
    const place = `E2E 돌아오기 ${randomUUID()}`;
    const location = createUniqueLocation();
    const { id, remove } = await createPinnedRecord({ title: "E2E 돌아온 기록", place, ...location });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });

    try {
      await openMap(page);
      const pin = getPhotoPin(page, place);
      await pin.waitFor();
      const before = await getFakeMapCounts(page);
      await pin.dispatchEvent("click");
      await page.getByRole("region", { name: `${place} 사진` }).getByRole("link").click();
      await page.waitForURL(`**/dates/${id}?photo=*`);

      // Act
      await page.getByRole("heading", { name: "E2E 돌아온 기록" }).waitFor();
      await page.goBack();
      await page.waitForURL(`**${RECORDS_MAP_PATH}`);
      await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();

      // Assert: 지도도, 지도의 범위도 그대로다
      await expect(getPhotoPin(page, place)).toBeAttached();
      expect(await getFakeMapCounts(page)).toEqual({ ...before, mapCount: 1 });
    } finally {
      await remove();
    }
  });

  test("지도를 불러오지 못하면 알려 주고, 다시 시도하면 그린다", async ({ page }) => {
    // Arrange
    const place = `E2E 지도 실패 ${randomUUID()}`;
    const { remove } = await createPinnedRecord({ title: "E2E 지도 실패 기록", place, ...createUniqueLocation() });
    await page.route(KAKAO_SDK_URL, (route) => route.abort());

    try {
      // Act
      await openMap(page);

      // Assert
      await expect(page.getByRole("alert").filter({ hasText: "지도를 불러오지 못했어요" })).toBeVisible();

      // Act
      await page.unroute(KAKAO_SDK_URL);
      await fakeMapSdk(page);
      await page.getByRole("button", { name: "다시 시도" }).click();

      // Assert
      await expect(getPhotoPin(page, place)).toBeAttached();
      await expect(page.getByRole("alert").filter({ hasText: "지도를 불러오지 못했어요" })).toHaveCount(0);
    } finally {
      await remove();
    }
  });

  test("SDK는 주소에 autoload=false와 묶음 기능(clusterer)을 붙여 부른다", async ({ page }) => {
    // Arrange
    const { remove } = await createPinnedRecord({ title: "E2E SDK 주소", place: `E2E SDK ${randomUUID()}`, ...createUniqueLocation() });
    const urls = await fakeMapSdk(page);

    try {
      // Act
      await openMap(page);
      await expect.poll(() => urls.length).toBeGreaterThan(0);

      // Assert
      const { searchParams, protocol } = new URL(urls[0] ?? "");
      expect(protocol).toBe("https:");
      expect(searchParams.get("autoload")).toBe("false");
      expect(searchParams.get("libraries")).toBe("clusterer");
      expect(searchParams.get("appkey")).toBe("e2e-dummy");
    } finally {
      await remove();
    }
  });
});
