import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { RECORDS_MAP_PATH } from "@/lib/dates/map";
import { MAP_PHOTOS_PATH } from "@/lib/dates/map-photos";
import { createUniqueLocation, fakeMapSdk, moveFakeMap, toViewBoxAround, type FakeWindow } from "./support/fake-kakao-map";
import { addLocatedPhotoRows, addRecordPhoto, createDisposableRecord, getRecordPhotoIds, setRecordPhotoLocation } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

/** 위도 0.0001도는 약 11m */
const northOf = ({ lat, lng }: { lat: number; lng: number }, meters: number) => ({ lat: lat + (meters / 11.1) * 0.0001, lng });

interface LocatedRecord {
  id: string;
  photoIds: string[];
  remove: () => Promise<void>;
}

/** 사진 1장짜리 일회용 기록을 만들고 그 사진에 위치를 넣는다 */
const createPhotoLocatedRecord = async ({
  title,
  place,
  location,
  date,
}: {
  title: string;
  place: string;
  location: { lat: number; lng: number };
  date?: string;
}): Promise<LocatedRecord> => {
  const id = randomUUID();
  const remove = await createDisposableRecord(date ? { id, title, date } : { id, title });
  await setRecordPhotoLocation(id, { place, ...location });
  return { id, photoIds: await getRecordPhotoIds(id), remove };
};

const openMap = async (page: Page): Promise<void> => {
  await openScreen(page, RECORDS_MAP_PATH, page.getByRole("heading", { name: "지도" }));
};

/** 지도 위 사진 핀. 이름은 "<장소> 사진 N장"이다. 같은 이름의 스크린 리더용 목록 버튼은 글자로 이름을 가져 aria-label로만 고른다 */
const getPhotoPin = (page: Page, place: string, count: number): Locator => page.getByLabel(`${place} 사진 ${count}장`, { exact: true });

/** 가짜 지도는 핀을 모두 왼쪽 위에 겹쳐 두므로, 다른 핀에 가리지 않게 요소에 바로 누름을 보낸다 */
const pressPhotoPin = async (pin: Locator): Promise<void> => {
  await pin.dispatchEvent("click");
};

const getStrip = (page: Page, place: string): Locator => page.getByRole("region", { name: `${place} 사진` });

/** 지도 사진 API로 보낸 사진 id 묶음을 보낸 순서대로 남긴다 */
const recordMapPhotoRequests = (page: Page): string[][] => {
  const requests: string[][] = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname === MAP_PHOTOS_PATH) requests.push(url.searchParams.get("ids")?.split(",") ?? []);
  });
  return requests;
};

test.describe("지도 사진 핀", () => {
  test("50m 안 사진을 한 사진 핀으로 묶어 장수를 붙인다", async ({ page }) => {
    // Arrange
    const place = `E2E 사진 핀 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 사진 핀 기록", place, location });
    await addRecordPhoto(record.id, { sortOrder: 1, location: { place: "옆자리", ...northOf(location, 30) } });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });

    try {
      // Act
      await openMap(page);

      // Assert
      const pin = getPhotoPin(page, place, 2);
      await expect(pin).toBeAttached();
      await expect(pin).toContainText("2");
      await expect(pin.locator("img")).toHaveAttribute("src", /.+/);
      expect((await pin.boundingBox())?.width).toBeGreaterThanOrEqual(44);
    } finally {
      await record.remove();
    }
  });

  test("사진 핀을 누르면 아래 칸에 그 자리 사진을 최근 기록부터 보여 주고, 사진을 누르면 그 사진이 펼쳐진 기록 상세로 간다", async ({ page }) => {
    // Arrange
    const place = `E2E 사진 줄 ${randomUUID()}`;
    const location = createUniqueLocation();
    const older = await createPhotoLocatedRecord({ title: "E2E 예전 데이트", place, location, date: "2026-01-02" });
    const newer = await createPhotoLocatedRecord({ title: "E2E 최근 데이트", place, location });
    const secondPhotoId = await addRecordPhoto(newer.id, { sortOrder: 1, location: { place, ...location }, takenAt: "2026-11-10T05:03:22+00:00" });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });

    try {
      await openMap(page);

      // Act
      await pressPhotoPin(getPhotoPin(page, place, 3));

      // Assert
      const strip = getStrip(page, place);
      await expect(strip.getByText("사진 3장")).toBeVisible();
      const links = strip.getByRole("link");
      await expect(links).toHaveCount(3);
      await expect(links.nth(0)).toContainText("E2E 최근 데이트");
      await expect(links.nth(1)).toContainText("2026.11.10 · 오후 2:03");
      await expect(links.nth(2)).toContainText("E2E 예전 데이트");
      await expect(links.nth(2)).toContainText("2026.01.02");

      // Act
      await links.nth(1).click();

      // Assert
      await page.waitForURL(`**/dates/${newer.id}?photo=${secondPhotoId}`);
      await expect(page.getByRole("region", { name: "사진" }).getByText("2 / 2")).toBeVisible();
    } finally {
      await older.remove();
      await newer.remove();
    }
  });

  test("상세에서 다른 사진으로 넘긴 뒤 돌아와 같은 사진을 다시 누르면 그 사진부터 보인다", async ({ page }) => {
    // Arrange
    const place = `E2E 다시 열기 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 다시 연 기록", place, location });
    await addRecordPhoto(record.id, { sortOrder: 1, location: { place, ...location } });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });
    const carousel = page.getByRole("region", { name: "사진" });

    try {
      await openMap(page);
      await pressPhotoPin(getPhotoPin(page, place, 2));
      const secondLink = getStrip(page, place).getByRole("link").nth(1);
      await secondLink.click();
      await expect(carousel.getByText("2 / 2")).toBeVisible();
      await carousel.getByRole("button", { name: "이전 사진" }).click();
      await expect(carousel.getByText("1 / 2")).toBeVisible();
      await page.goBack();
      await page.waitForURL(`**${RECORDS_MAP_PATH}`);

      // Act
      await secondLink.click();

      // Assert
      await page.waitForURL(`**/dates/${record.id}?photo=*`);
      await expect(carousel.getByText("2 / 2")).toBeVisible();
    } finally {
      await record.remove();
    }
  });

  test("뒤로 가기로 상세에 돌아오면 넘겨 보던 사진을 그대로 둔다", async ({ page }) => {
    // Arrange
    const place = `E2E 되돌아오기 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 되돌아온 기록", place, location });
    await addRecordPhoto(record.id, { sortOrder: 1, location: { place, ...location } });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });
    const carousel = page.getByRole("region", { name: "사진" });

    try {
      await openMap(page);
      await pressPhotoPin(getPhotoPin(page, place, 2));
      await getStrip(page, place).getByRole("link").nth(1).click();
      await carousel.getByRole("button", { name: "이전 사진" }).click();
      await expect(carousel.getByText("1 / 2")).toBeVisible();
      await page.goBack();
      await page.waitForURL(`**${RECORDS_MAP_PATH}`);

      // Act
      await page.goForward();

      // Assert
      await page.waitForURL(`**/dates/${record.id}?photo=*`);
      await expect(carousel.getByText("1 / 2")).toBeVisible();
    } finally {
      await record.remove();
    }
  });

  test("사진 핀을 누르면 받아 둔 대표 사진과 기록 제목·날짜를 바로 보여 주고, 대표 사진은 다시 내려받지 않는다", async ({ page }) => {
    // Arrange: 핀 썸네일을 받은 뒤의 사진 줄 요청은 테스트가 풀어 줄 때까지 붙잡아 둔다(느린 서버)
    const place = `E2E 바로 보기 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 바로 보기 기록", place, location, date: "2026-03-04" });
    await addRecordPhoto(record.id, { sortOrder: 1, location: { place, ...location } });
    let isHolding = false;
    const release = Promise.withResolvers<void>();
    await page.route(`**${MAP_PHOTOS_PATH}?*`, async (route) => {
      if (isHolding) await release.promise;
      await route.continue();
    });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });

    try {
      await openMap(page);
      const pin = getPhotoPin(page, place, 2);
      const pinImage = pin.locator("img");
      await expect(pinImage).toHaveAttribute("src", /.+/);
      const pinThumbUrl = await pinImage.getAttribute("src");
      isHolding = true;

      // Act
      await pressPhotoPin(pin);

      // Assert: 서버 응답 전에 대표 사진 칸이 이미 있다
      const links = getStrip(page, place).getByRole("link");
      await expect(links).toHaveCount(1);
      await expect(links.first()).toContainText("E2E 바로 보기 기록");
      await expect(links.first()).toContainText("2026.03.04");
      await expect(links.first().locator("img")).toHaveAttribute("src", pinThumbUrl ?? "");

      // Act
      release.resolve();

      // Assert: 나머지 사진이 이어 붙고, 대표 사진 주소는 그대로다
      await expect(links).toHaveCount(2);
      await expect(links.first().locator("img")).toHaveAttribute("src", pinThumbUrl ?? "");
    } finally {
      release.resolve();
      await record.remove();
    }
  });

  test("핀 누름이 지도의 누름으로도 이어져도 방금 연 사진 줄을 닫지 않고, 그 뒤에 빈 곳을 누르면 닫는다", async ({ page }) => {
    // Arrange
    const place = `E2E 누름 겹침 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 누름 겹침 기록", place, location });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });
    const fireMapClick = () =>
      page.evaluate(() => {
        const { fakeMap } = window as unknown as FakeWindow;
        fakeMap.fire(fakeMap.map, "click");
      });

    try {
      await openMap(page);
      const pin = getPhotoPin(page, place, 1);
      await expect(pin).toBeAttached();

      // Act: 휴대폰에서 핀을 누르면 지도도 누름을 받는 경우를 흉내 낸다
      await pin.evaluate((element: HTMLElement) => {
        element.click();
        const { fakeMap } = window as unknown as FakeWindow;
        fakeMap.fire(fakeMap.map, "click");
      });

      // Assert
      const strip = getStrip(page, place);
      await expect(strip).toBeVisible();

      // Act + Assert: 조금 지나 빈 곳을 누르면 닫는다
      await expect(async () => {
        await fireMapClick();
        await expect(strip).toBeHidden({ timeout: 200 });
      }).toPass();
    } finally {
      await record.remove();
    }
  });

  test("화면 안에 낱개로 보이는 사진 핀의 썸네일만 받고, 지도를 옮기면 새로 보이는 핀만 받는다", async ({ page }) => {
    // Arrange
    const locations = [createUniqueLocation(), createUniqueLocation(), createUniqueLocation()] as const;
    const records = await Promise.all(
      locations.map((location, index) => createPhotoLocatedRecord({ title: `E2E 썸네일 ${index}`, place: `E2E 썸네일 ${index} ${randomUUID()}`, location })),
    );
    const [first, second, third] = records.map(({ photoIds }) => photoIds[0] ?? "");
    const requests = recordMapPhotoRequests(page);
    await fakeMapSdk(page, { viewBox: toViewBoxAround(locations[0]) });

    try {
      // Act
      await openMap(page);

      // Assert: 처음에는 화면 안의 첫 핀만 받는다
      await expect.poll(() => requests).toEqual([[first]]);

      // Act: 둘째 핀 쪽으로 옮겼다가 첫 핀으로 돌아온 뒤 셋째 핀으로 옮긴다
      await moveFakeMap(page, toViewBoxAround(locations[1]));
      await expect.poll(() => requests).toEqual([[first], [second]]);
      await moveFakeMap(page, toViewBoxAround(locations[0]));
      await moveFakeMap(page, toViewBoxAround(locations[2]));

      // Assert: 받아 둔 첫 핀은 다시 받지 않는다(받았다면 셋째보다 먼저 보냈다)
      await expect.poll(() => requests).toEqual([[first], [second], [third]]);
    } finally {
      for (const record of records) await record.remove();
    }
  });

  test("사진이 많은 자리는 사진 줄을 옆으로 넘겨 끝에 가까워지면 이어 받는다", async ({ page }) => {
    // Arrange
    const place = `E2E 이어 받기 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 사진 많은 기록", place, location });
    await addLocatedPhotoRows(record.id, { count: 13, location: { place, ...location } });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });
    const requests = recordMapPhotoRequests(page);

    try {
      await openMap(page);
      await expect(getPhotoPin(page, place, 14).locator("img")).toHaveAttribute("src", /.+/);

      // Act
      await pressPhotoPin(getPhotoPin(page, place, 14));
      const links = getStrip(page, place).getByRole("link");
      await expect(links).toHaveCount(12);
      await links.last().scrollIntoViewIfNeeded();

      // Assert
      await expect(links).toHaveCount(14);
      expect(requests.slice(-2).map((ids) => ids.length)).toEqual([12, 2]);
    } finally {
      await record.remove();
    }
  });

  test("주소가 없던 대표 사진은 지도를 옮겼다 돌아와도 다시 받지 않는다", async ({ page }) => {
    // Arrange: 받는 사이 지워진 것처럼 첫 응답을 비운다
    const place = `E2E 없는 썸네일 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 없는 썸네일 기록", place, location });
    await page.route(`**${MAP_PHOTOS_PATH}?*`, (route) => route.fulfill({ json: { items: [] } }));
    const requests = recordMapPhotoRequests(page);
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });

    try {
      await openMap(page);
      await expect.poll(() => requests).toEqual([record.photoIds]);

      // Act
      await moveFakeMap(page, toViewBoxAround(createUniqueLocation()));
      await moveFakeMap(page, toViewBoxAround(location));

      // Assert: 옮긴 뒤 다시 받았다면 이 사이에 요청이 남는다
      await page.waitForTimeout(500);
      expect(requests).toEqual([record.photoIds]);
    } finally {
      await record.remove();
    }
  });

  test("사진 줄의 썸네일 주소가 만료돼 받지 못하면 그 사진만 새 주소를 받아 다시 그린다", async ({ page }) => {
    // Arrange: 사진 줄의 첫 응답에서 둘째 사진 주소를 받을 수 없는 주소로 바꾼다
    const place = `E2E 만료 주소 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 만료 주소 기록", place, location });
    const secondPhotoId = await addRecordPhoto(record.id, { sortOrder: 1, location: { place, ...location } });
    let isExpiredSent = false;
    await page.route(`**${MAP_PHOTOS_PATH}?*`, async (route) => {
      const ids = new URL(route.request().url()).searchParams.get("ids")?.split(",") ?? [];
      if (isExpiredSent || ids.length < 2) return route.continue();
      isExpiredSent = true;
      const response = await route.fetch();
      const body = (await response.json()) as { items: { id: string; thumbUrl?: string }[] };
      const items = body.items.map((item) => (item.id === secondPhotoId ? { ...item, thumbUrl: "/e2e-expired-thumb.jpg" } : item));
      await route.fulfill({ response, json: { items } });
    });
    const requests = recordMapPhotoRequests(page);
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });

    try {
      await openMap(page);

      // Act
      await pressPhotoPin(getPhotoPin(page, place, 2));

      // Assert
      const secondImage = getStrip(page, place).getByRole("link").nth(1).locator("img");
      await expect(secondImage).toHaveAttribute("src", /^(?!\/e2e-expired-thumb).+/);
      await expect.poll(() => secondImage.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
      expect(requests.at(-1)).toEqual([secondPhotoId]);
    } finally {
      await record.remove();
    }
  });

  test("핀을 그린 뒤 사진이 모두 지워진 자리를 누르면 지워졌다고 알려 준다", async ({ page }) => {
    // Arrange
    const place = `E2E 지워진 자리 ${randomUUID()}`;
    const location = createUniqueLocation();
    const record = await createPhotoLocatedRecord({ title: "E2E 지워진 자리 기록", place, location });
    await fakeMapSdk(page, { viewBox: toViewBoxAround(location) });

    try {
      await openMap(page);
      const pin = getPhotoPin(page, place, 1);
      await expect(pin).toBeAttached();
      await record.remove();

      // Act
      await pressPhotoPin(pin);

      // Assert
      const strip = getStrip(page, place);
      await expect(strip.getByText("이 자리 사진이 모두 지워졌어요.")).toBeVisible();
      await expect(strip.getByText("사진 0장")).toBeVisible();
    } finally {
      await record.remove();
    }
  });
});
