import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createDisposableRecord, deleteRecordWithFiles, getRecordIdsByTitle, getRecordLocation, setRecordLocation } from "./support/seed";
import { pickPhoto } from "./support/actions";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";

const SEONGSU = { id: "1", name: "성수 카페", address: "서울 성동구 연무장길 1", lat: 37.5445, lng: 127.0561 };

/** 실제 카카오를 부르지 않게 우리 API의 응답을 정해 둔다. 받은 검색어를 돌려준다 */
const fakePlaceSearch = async (page: Page, respond: { status?: number; items?: (typeof SEONGSU)[] }): Promise<string[]> => {
  const queries: string[] = [];
  await page.route("**/api/places/search*", async (route) => {
    queries.push(new URL(route.request().url()).searchParams.get("q") ?? "");
    await route.fulfill({ status: respond.status ?? 200, json: { items: respond.items ?? [] } });
  });
  return queries;
};

const openEditForm = async (page: Page, id: string): Promise<void> => {
  await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));
};

const save = async (page: Page, id: string): Promise<void> => {
  await page.getByRole("button", { name: "저장" }).click();
  await page.waitForURL(new RegExp(`/dates/${id}$`));
};

test.describe("기록 장소 찾기", () => {
  test("찾은 장소를 고르면 이름이 채워지고 저장하면 좌표가 남는다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 장소 찾기" });
    const queries = await fakePlaceSearch(page, { items: [SEONGSU] });

    try {
      await openEditForm(page, id);

      // Act
      await page.locator("#place").fill("성수");
      await page.getByRole("button", { name: "장소 찾기" }).click();
      await page.getByRole("button", { name: /성수 카페/ }).click();

      // Assert: 고른 뒤
      expect(queries).toEqual(["성수"]);
      await expect(page.locator("#place")).toHaveValue("성수 카페");
      await expect(page.getByText("지도에 표시되는 장소예요")).toBeVisible();
      await expect(page.getByRole("list", { name: "찾은 장소" })).toHaveCount(0);

      // Act
      await save(page, id);

      // Assert: 저장한 뒤
      expect(await getRecordLocation(id)).toEqual({ place_lat: SEONGSU.lat, place_lng: SEONGSU.lng });
    } finally {
      await deleteRecord();
    }
  });

  test("장소 이름을 직접 고치면 좌표를 지운다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 장소 고침" });
    await setRecordLocation(id, { place: "성수 카페", lat: SEONGSU.lat, lng: SEONGSU.lng });

    try {
      await openEditForm(page, id);
      await expect(page.getByText("지도에 표시되는 장소예요")).toBeVisible();

      // Act
      await page.locator("#place").fill("다른 곳");
      await save(page, id);

      // Assert
      expect(await getRecordLocation(id)).toEqual({ place_lat: null, place_lng: null });
    } finally {
      await deleteRecord();
    }
  });

  test("위치 지우기를 누르면 이름은 두고 좌표만 지운다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 위치 지우기" });
    await setRecordLocation(id, { place: "성수 카페", lat: SEONGSU.lat, lng: SEONGSU.lng });

    try {
      await openEditForm(page, id);

      // Act
      await page.getByRole("button", { name: "위치 지우기" }).click();

      // Assert
      await expect(page.getByText("지도에 표시되는 장소예요")).toHaveCount(0);
      await expect(page.locator("#place")).toHaveValue("성수 카페");
      await save(page, id);
      expect(await getRecordLocation(id)).toEqual({ place_lat: null, place_lng: null });
    } finally {
      await deleteRecord();
    }
  });

  test("다른 칸만 고쳐 저장하면 좌표를 그대로 둔다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 좌표 유지" });
    await setRecordLocation(id, { place: "성수 카페", lat: SEONGSU.lat, lng: SEONGSU.lng });

    try {
      await openEditForm(page, id);

      // Act
      await page.locator("#memo").fill("글만 고쳤다");
      await save(page, id);

      // Assert
      expect(await getRecordLocation(id)).toEqual({ place_lat: SEONGSU.lat, place_lng: SEONGSU.lng });
    } finally {
      await deleteRecord();
    }
  });

  test("찾은 장소가 없으면 알려 주고, 적은 이름 그대로 저장할 수 있다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 장소 없음" });
    await fakePlaceSearch(page, { items: [] });

    try {
      await openEditForm(page, id);

      // Act
      await page.locator("#place").fill("우리만 아는 곳");
      await page.getByRole("button", { name: "장소 찾기" }).click();

      // Assert
      await expect(page.getByRole("status").filter({ hasText: "찾은 장소가 없어요" })).toBeVisible();
      await save(page, id);
      await expect(page.getByText("우리만 아는 곳")).toBeVisible();
      expect(await getRecordLocation(id)).toEqual({ place_lat: null, place_lng: null });
    } finally {
      await deleteRecord();
    }
  });

  test("찾기에 실패하면 알려 주고 적은 글자는 남긴다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 찾기 실패" });
    await fakePlaceSearch(page, { status: 502 });

    try {
      await openEditForm(page, id);

      // Act
      await page.locator("#place").fill("성수");
      await page.getByRole("button", { name: "장소 찾기" }).click();

      // Assert
      await expect(page.getByRole("status").filter({ hasText: "장소를 찾지 못했어요" })).toBeVisible();
      await expect(page.locator("#place")).toHaveValue("성수");
    } finally {
      await deleteRecord();
    }
  });

  test("칸이 비어 있으면 서버를 부르지 않고 적어 달라고 한다", async ({ page }) => {
    // Arrange
    const queries = await fakePlaceSearch(page, { items: [] });
    await openScreen(page, "/dates/new", page.locator("#memo"));

    // Act
    await page.getByRole("button", { name: "장소 찾기" }).click();

    // Assert
    await expect(page.getByRole("status").filter({ hasText: "찾을 장소를 적어 주세요" })).toBeVisible();
    expect(queries).toEqual([]);
  });

  test("칸에서 Enter를 누르면 저장하지 않고 장소를 찾는다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 엔터로 찾기" });
    const queries = await fakePlaceSearch(page, { items: [SEONGSU] });

    try {
      await openEditForm(page, id);

      // Act
      await page.locator("#place").fill("성수");
      await page.locator("#place").press("Enter");

      // Assert
      await expect(page.getByRole("list", { name: "찾은 장소" })).toBeVisible();
      expect(queries).toEqual(["성수"]);
      expect(new URL(page.url()).pathname).toBe(`/dates/${id}/edit`);
    } finally {
      await deleteRecord();
    }
  });

  test("카카오 한도를 넘으면 오늘은 찾을 수 없다고 알린다", async ({ page }) => {
    // Arrange
    await fakePlaceSearch(page, { status: 429 });
    await openScreen(page, "/dates/new", page.locator("#memo"));

    // Act
    await page.locator("#place").fill("성수");
    await page.getByRole("button", { name: "장소 찾기" }).click();

    // Assert
    await expect(page.getByRole("status").filter({ hasText: "오늘은 장소를 더 찾을 수 없어요" })).toBeVisible();
  });

  test("장소가 100자를 넘으면 서버를 부르지 않고 줄여 달라고 한다", async ({ page }) => {
    // Arrange
    const queries = await fakePlaceSearch(page, { items: [] });
    await openScreen(page, "/dates/new", page.locator("#memo"));

    // Act
    await page.locator("#place").fill("가".repeat(101));
    await page.getByRole("button", { name: "장소 찾기" }).click();

    // Assert
    await expect(page.getByRole("status").filter({ hasText: "장소는 100자까지" })).toBeVisible();
    expect(queries).toEqual([]);
  });

  test("찾는 중에 로그인이 풀렸으면 다시 로그인 창을 띄운다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await page.locator("#place").fill("성수");
    await page.context().clearCookies();

    // Act
    await page.getByRole("button", { name: "장소 찾기" }).click();

    // Assert
    await expect(page.getByRole("dialog", { name: "다시 로그인해 주세요" })).toBeVisible();
    await expect(page.locator("#place")).toHaveValue("성수");
  });

  test("저장한 뒤 새 기록 폼을 다시 열면 지난 찾기 결과가 남아 있지 않다", async ({ page }, testInfo) => {
    // Arrange
    const title = `E2E 찾기 결과 비우기 ${testInfo.project.name}`;
    await fakePlaceSearch(page, { items: [SEONGSU] });
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await pickPhoto(page, 1);
    await page.locator("#title").fill(title);
    await page.locator("#place").fill("성수");
    await page.getByRole("button", { name: "장소 찾기" }).click();
    await expect(page.getByRole("list", { name: "찾은 장소" })).toBeVisible();

    try {
      // Act
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await page.waitForURL(/\/records/);
      await page.getByRole("link", { name: "기록 남기기" }).click();
      await page.waitForURL("**/dates/new");

      // Assert
      const place = page.locator("#place").locator("visible=true");
      await expect(place).toHaveValue("");
      await expect(page.getByRole("list", { name: "찾은 장소" })).toHaveCount(0);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("찾은 뒤 글자를 고치면 예전 결과를 닫는다", async ({ page }) => {
    // Arrange
    await fakePlaceSearch(page, { items: [SEONGSU] });
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await page.locator("#place").fill("성수");
    await page.getByRole("button", { name: "장소 찾기" }).click();
    await expect(page.getByRole("list", { name: "찾은 장소" })).toBeVisible();

    // Act
    await page.locator("#place").fill("성수동");

    // Assert
    await expect(page.getByRole("list", { name: "찾은 장소" })).toHaveCount(0);
  });

  test("긴 이름의 결과도 가로로 넘치지 않고, 찾기 버튼과 결과는 44px 넘게 눌린다", async ({ page }) => {
    // Arrange
    const name = "아주 긴 이름의 장소 ".repeat(8).trim();
    await fakePlaceSearch(page, { items: [{ ...SEONGSU, name, address: "주소 ".repeat(30).trim() }] });
    await openScreen(page, "/dates/new", page.locator("#memo"));
    const searchButton = page.getByRole("button", { name: "장소 찾기" });
    const searchBox = await searchButton.boundingBox();

    // Act
    await page.locator("#place").fill("긴");
    await searchButton.click();
    const result = page.getByRole("button", { name: new RegExp(name) });
    await result.waitFor();

    // Assert
    expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);
    expect(searchBox?.height).toBeGreaterThanOrEqual(44);
    expect(searchBox?.width).toBeGreaterThanOrEqual(44);
    expect((await result.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  });

  test("로그인하지 않으면 장소 찾기 API를 부를 수 없다", async ({ playwright, baseURL }) => {
    // Arrange
    const anonymous = await playwright.request.newContext({ baseURL, storageState: { cookies: [], origins: [] } });

    // Act
    const response = await anonymous.get("/api/places/search?q=성수", { maxRedirects: 0 });

    // Assert
    expect(response.status()).toBe(307);
    expect(response.headers().location).toContain("/login");
    await anonymous.dispose();
  });

  test("검색어가 없으면 카카오를 부르지 않고 잘못된 요청으로 답한다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/dates/new", page.locator("#memo"));

    // Act
    const response = await page.request.get("/api/places/search?q=%20");

    // Assert
    expect(response.status()).toBe(400);
    expect((await response.json()).code).toBe("INVALID_QUERY");
  });
});
