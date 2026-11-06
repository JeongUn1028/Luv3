import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { RECORDS_MAP_PATH } from "@/lib/dates/map";
import { createDisposableRecord, setRecordLocation } from "./support/seed";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";

const SDK_URL = "**/dapi.kakao.com/v2/maps/sdk.js*";

/** 실제 카카오를 부르지 않게 지도 SDK를 대신한다. 그린 핀과 지도 수를 창에 남겨 테스트가 읽고 누른다 */
const FAKE_SDK = `
window.fakeMap = { markers: [], mapCount: 0, boundsCount: 0, centerCount: 0 };
window.kakao = {
  maps: {
    load: (callback) => callback(),
    LatLng: class { constructor(lat, lng) { this.lat = lat; this.lng = lng; } },
    LatLngBounds: class { extend() {} },
    Map: class {
      constructor() { window.fakeMap.mapCount += 1; }
      setBounds() { window.fakeMap.boundsCount += 1; }
      setCenter() { window.fakeMap.centerCount += 1; }
      relayout() {}
    },
    Marker: class {
      constructor({ position, title }) { this.position = position; this.title = title; }
      setMap(map) {
        window.fakeMap.markers = window.fakeMap.markers.filter((marker) => marker !== this);
        if (map) window.fakeMap.markers.push(this);
      }
    },
    event: { addListener: (target, type, handler) => { target[type] = handler; } },
  },
};
`;

/** 페이지에서 읽는 가짜 지도의 모양 */
interface FakeWindow extends Window {
  fakeMap: {
    markers: { title: string; click: () => void }[];
    mapCount: number;
    boundsCount: number;
    centerCount: number;
  };
}

const fakeMapSdk = async (page: Page): Promise<void> => {
  await page.route(SDK_URL, (route) => route.fulfill({ contentType: "text/javascript", body: FAKE_SDK }));
};

/** 나란히 도는 다른 테스트의 기록과 같은 핀으로 묶이지 않도록 테스트마다 자리를 따로 쓴다 */
const createUniqueLocation = (): { lat: number; lng: number } => ({ lat: 33 + Math.random() * 5, lng: 125 + Math.random() * 5 });

const createPinnedRecord = async ({ title, place, lat, lng }: { title: string; place: string; lat: number; lng: number }): Promise<{ id: string; remove: () => Promise<void> }> => {
  const id = randomUUID();
  const remove = await createDisposableRecord({ id, title });
  await setRecordLocation(id, { place, lat, lng });
  return { id, remove };
};

const openMap = async (page: Page): Promise<void> => {
  await openScreen(page, RECORDS_MAP_PATH, page.getByRole("heading", { name: "지도" }));
};

const getMarkerTitles = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as FakeWindow).fakeMap.markers.map(({ title }) => title));

const getFakeMapCounts = (page: Page): Promise<{ mapCount: number; boundsCount: number; centerCount: number }> =>
  page.evaluate(() => {
    const { mapCount, boundsCount, centerCount } = (window as unknown as FakeWindow).fakeMap;
    return { mapCount, boundsCount, centerCount };
  });

const waitForMarker = async (page: Page, title: string): Promise<void> => {
  await page.waitForFunction((name) => (window as unknown as Partial<FakeWindow>).fakeMap?.markers.some((marker) => marker.title === name), title);
};

const pressMarker = async (page: Page, title: string): Promise<void> => {
  await waitForMarker(page, title);
  await page.evaluate((name) => {
    (window as unknown as FakeWindow).fakeMap.markers.find((marker) => marker.title === name)?.click();
  }, title);
};

const getPinPanel = (page: Page, place: string): Locator => page.getByRole("region", { name: `${place} 기록` });

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

  test("좌표가 있는 기록만 핀으로 그린다", async ({ page }) => {
    // Arrange
    const place = `E2E 핀 ${randomUUID()}`;
    const pinned = await createPinnedRecord({ title: "E2E 핀 있는 기록", place, ...createUniqueLocation() });
    const noPinTitle = `E2E 핀 없는 기록 ${randomUUID()}`;
    const removeNoPin = await createDisposableRecord({ id: randomUUID(), title: noPinTitle });
    await fakeMapSdk(page);

    try {
      // Act
      await openMap(page);
      await waitForMarker(page, place);

      // Assert
      const titles = await getMarkerTitles(page);
      expect(titles).toContain(place);
      await expect(page.getByRole("link", { name: place })).toBeAttached();
      await expect(page.getByRole("link", { name: noPinTitle })).toHaveCount(0);
    } finally {
      await pinned.remove();
      await removeNoPin();
    }
  });

  test("기록이 하나인 핀을 누르면 그 기록으로 바로 간다", async ({ page }) => {
    // Arrange
    const place = `E2E 한 기록 ${randomUUID()}`;
    const { id, remove } = await createPinnedRecord({ title: "E2E 핀에서 간 기록", place, ...createUniqueLocation() });
    await fakeMapSdk(page);

    try {
      await openMap(page);

      // Act
      await pressMarker(page, place);

      // Assert
      await page.waitForURL(`**/dates/${id}`);
      await expect(page.getByRole("heading", { name: "E2E 핀에서 간 기록" })).toBeVisible();
    } finally {
      await remove();
    }
  });

  test("상세에서 뒤로 돌아오면 지도를 새로 만들지 않아 보던 자리를 지킨다", async ({ page }) => {
    // Arrange
    const place = `E2E 돌아오기 ${randomUUID()}`;
    const { id, remove } = await createPinnedRecord({ title: "E2E 돌아온 기록", place, ...createUniqueLocation() });
    await fakeMapSdk(page);

    try {
      await openMap(page);
      await waitForMarker(page, place);
      const before = await getFakeMapCounts(page);
      await pressMarker(page, place);
      await page.waitForURL(`**/dates/${id}`);

      // Act
      await page.getByRole("heading", { name: "E2E 돌아온 기록" }).waitFor();
      await page.goBack();
      await page.waitForURL(`**${RECORDS_MAP_PATH}`);
      await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();

      // Assert: 지도도, 지도의 범위도 그대로다
      await waitForMarker(page, place);
      expect(await getFakeMapCounts(page)).toEqual({ ...before, mapCount: 1 });
    } finally {
      await remove();
    }
  });

  test("기록이 여러 개인 핀을 누르면 목록을 보여 주고, 고르면 그 기록으로 간다", async ({ page }) => {
    // Arrange
    const place = `E2E 여러 기록 ${randomUUID()}`;
    const location = createUniqueLocation();
    const first = await createPinnedRecord({ title: "E2E 같은 자리 하나", place, ...location });
    const second = await createPinnedRecord({ title: "E2E 같은 자리 둘", place, ...location });
    await fakeMapSdk(page);

    try {
      await openMap(page);

      // Act
      await pressMarker(page, place);

      // Assert: 목록
      const panel = getPinPanel(page, place);
      await expect(panel.getByRole("link")).toHaveCount(2);
      const link = panel.getByRole("link", { name: /E2E 같은 자리 둘/ });
      expect((await link.boundingBox())?.height).toBeGreaterThanOrEqual(44);
      expect(new URL(page.url()).pathname).toBe(RECORDS_MAP_PATH);
      expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);

      // Act
      await link.click();

      // Assert: 상세
      await page.waitForURL(`**/dates/${second.id}`);
    } finally {
      await first.remove();
      await second.remove();
    }
  });

  test("좌표가 같아도 이름이 다른 기록은 목록에 자기 장소 이름을 보여 준다", async ({ page }) => {
    // Arrange
    const suffix = randomUUID();
    const location = createUniqueLocation();
    const first = await createPinnedRecord({ title: "E2E 1층", place: `1층 가게 ${suffix}`, ...location });
    const second = await createPinnedRecord({ title: "E2E 2층", place: `2층 가게 ${suffix}`, ...location });
    await fakeMapSdk(page);

    try {
      await openMap(page);
      await page.waitForFunction((end) => (window as unknown as Partial<FakeWindow>).fakeMap?.markers.some(({ title }) => title.endsWith(end)), suffix);
      const pinTitle = (await getMarkerTitles(page)).find((title) => title.endsWith(suffix)) ?? "";

      // Act
      await pressMarker(page, pinTitle);

      // Assert
      const panel = getPinPanel(page, pinTitle);
      await expect(panel).toContainText(`1층 가게 ${suffix}`);
      await expect(panel).toContainText(`2층 가게 ${suffix}`);
    } finally {
      await first.remove();
      await second.remove();
    }
  });

  test("목록을 연 채 기록이 하나인 핀을 눌렀다 돌아오면 그 목록이 닫혀 있다", async ({ page }) => {
    // Arrange
    const manyPlace = `E2E 목록 핀 ${randomUUID()}`;
    const onePlace = `E2E 한 핀 ${randomUUID()}`;
    const location = createUniqueLocation();
    const first = await createPinnedRecord({ title: "E2E 목록 하나", place: manyPlace, ...location });
    const second = await createPinnedRecord({ title: "E2E 목록 둘", place: manyPlace, ...location });
    const one = await createPinnedRecord({ title: "E2E 한 기록", place: onePlace, ...createUniqueLocation() });
    await fakeMapSdk(page);

    try {
      await openMap(page);
      await pressMarker(page, manyPlace);
      await expect(getPinPanel(page, manyPlace)).toBeVisible();

      // Act
      await pressMarker(page, onePlace);
      await page.waitForURL(`**/dates/${one.id}`);
      await page.getByRole("heading", { name: "E2E 한 기록" }).waitFor();
      await page.goBack();
      await page.waitForURL(`**${RECORDS_MAP_PATH}`);
      await expect(page.getByRole("heading", { name: "지도" })).toBeVisible();

      // Assert
      await expect(getPinPanel(page, manyPlace)).toHaveCount(0);
    } finally {
      await first.remove();
      await second.remove();
      await one.remove();
    }
  });

  test("목록은 닫기 버튼으로 닫는다", async ({ page }) => {
    // Arrange
    const place = `E2E 목록 닫기 ${randomUUID()}`;
    const location = createUniqueLocation();
    const first = await createPinnedRecord({ title: "E2E 닫기 하나", place, ...location });
    const second = await createPinnedRecord({ title: "E2E 닫기 둘", place, ...location });
    await fakeMapSdk(page);

    try {
      await openMap(page);
      await pressMarker(page, place);
      const panel = getPinPanel(page, place);
      const closeButton = panel.getByRole("button", { name: "목록 닫기" });
      const box = await closeButton.boundingBox();

      // Act
      await closeButton.click();

      // Assert
      await expect(panel).toHaveCount(0);
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    } finally {
      await first.remove();
      await second.remove();
    }
  });

  test("지도를 불러오지 못하면 알려 주고, 다시 시도하면 그린다", async ({ page }) => {
    // Arrange
    const place = `E2E 지도 실패 ${randomUUID()}`;
    const { remove } = await createPinnedRecord({ title: "E2E 지도 실패 기록", place, ...createUniqueLocation() });
    await page.route(SDK_URL, (route) => route.abort());

    try {
      // Act
      await openMap(page);

      // Assert
      await expect(page.getByRole("alert").filter({ hasText: "지도를 불러오지 못했어요" })).toBeVisible();

      // Act
      await page.unroute(SDK_URL);
      await fakeMapSdk(page);
      await page.getByRole("button", { name: "다시 시도" }).click();

      // Assert
      await waitForMarker(page, place);
      await expect(page.getByRole("alert").filter({ hasText: "지도를 불러오지 못했어요" })).toHaveCount(0);
    } finally {
      await remove();
    }
  });

  test("SDK는 주소에 autoload=false를 붙여 부른다", async ({ page }) => {
    // Arrange
    const { remove } = await createPinnedRecord({ title: "E2E SDK 주소", place: `E2E SDK ${randomUUID()}`, ...createUniqueLocation() });
    const urls: string[] = [];
    await page.route(SDK_URL, (route) => {
      urls.push(route.request().url());
      return route.fulfill({ contentType: "text/javascript", body: FAKE_SDK });
    });

    try {
      // Act
      await openMap(page);
      await expect.poll(() => urls.length).toBeGreaterThan(0);

      // Assert
      const { searchParams, protocol } = new URL(urls[0] ?? "");
      expect(protocol).toBe("https:");
      expect(searchParams.get("autoload")).toBe("false");
      expect(searchParams.get("appkey")).toBe("e2e-dummy");
    } finally {
      await remove();
    }
  });
});
