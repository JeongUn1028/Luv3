import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { isScreenRequest, returnToApp } from "./support/actions";
import { TARGET_DEVICES } from "./support/devices";
import { createDisposableRecords } from "./support/seed";
import { expect, getScrollArea, openScreen, test } from "./support/test";

// 기록이 그대로면 화면을 새로 받아도 이어 받은 그리드·찾기 결과를 다시 받지 않는지(#273, #274).
// 화면은 모든 기록의 판 번호(date_records_version)가 같을 때만 지키므로, 나란히 도는 다른 스펙이 기록을 쓰면 맞게 처음부터 다시 받아
// 이 확인이 흔들린다. 그래서 기기 프로젝트가 모두 끝난 뒤 따로 돈다(`SHARED_DATA_SPECS`). 두 기기 크기는 여기서 차례로 돈다

/** 한 묶음(60개)보다 많게 만든다 */
const RECORD_COUNT = 65;
const MINUTE_MS = 60_000;

const getRecordLink = (page: Page, title: string): Locator => page.getByRole("link", { name: new RegExp(`${title},`) });

const scrollToEnd = (page: Page): Promise<void> => getScrollArea(page).evaluate((element) => element.scrollTo({ top: element.scrollHeight }));

/** 맨 아래로 내리기를 되풀이해 `link`가 붙을 때까지 이어 받는다 */
const loadUntilAttached = async (page: Page, link: Locator): Promise<void> => {
  await expect(async () => {
    await scrollToEnd(page);
    await expect(link).toBeAttached({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
};

/** 다음 묶음 요청. `isSearch`면 찾기의 것, 아니면 그리드의 것이다 */
const isNextPage = (url: URL, isSearch: boolean): boolean =>
  url.pathname === "/api/records/search" && url.searchParams.has("beforeId") && url.searchParams.has("q") === isSearch;

for (const device of TARGET_DEVICES) {
  test.describe(`기록이 그대로인 채 화면을 새로 받으면 (${device.name})`, () => {
    test.use(device.use);

    test("이어 받은 기록의 상세에 갔다 돌아와도 다시 받지 않고 보던 자리를 보여 준다", async ({ page }) => {
      // Arrange
      const prefix = `E2E 그리드 ${randomUUID().slice(0, 8)}`;
      const deleteRecords = await createDisposableRecords({ count: RECORD_COUNT, titlePrefix: prefix });
      await page.clock.install();
      // 처음부터 다시 받으면 이미 받았던 자리를 다시 부른다. 뒤에 기록이 더 있어 새 자리(다음 묶음)를 부르는 것은 괜찮다
      const requestedCursors: string[] = [];
      const repeatedCursors: string[] = [];
      let isBack = false;
      page.on("request", (request) => {
        const url = new URL(request.url());
        if (!isNextPage(url, false)) return;
        const cursor = url.searchParams.get("beforeId") ?? "";
        if (isBack && requestedCursors.includes(cursor)) repeatedCursors.push(cursor);
        requestedCursors.push(cursor);
      });

      try {
        await openScreen(page, "/records", page.getByRole("button", { name: "기록 찾기" }));
        const oldest = getRecordLink(page, `${prefix} 0`);
        await loadUntilAttached(page, oldest);
        await oldest.click();
        await page.getByRole("link", { name: "뒤로" }).waitFor();
        isBack = true;
        // 상세에 30분 넘게 있다 돌아오면 기록 탭 화면을 새로 받는다
        await page.clock.fastForward(31 * MINUTE_MS);
        const refreshed = page.waitForRequest((request) => isScreenRequest(request, "/records"));

        // Act
        await page.getByRole("link", { name: "뒤로" }).click();
        await refreshed;
        await page.waitForTimeout(1_000);

        // Assert
        await expect(oldest).toBeInViewport();
        expect(repeatedCursors).toEqual([]);
      } finally {
        await deleteRecords();
      }
    });

    test("앱으로 돌아와도 이어 받은 찾기 결과를 다시 받지 않는다", async ({ page }) => {
      // Arrange
      const word = `찾기${randomUUID().slice(0, 6)}`;
      const prefix = `E2E 묶음 새로 ${word}`;
      const deleteRecords = await createDisposableRecords({ count: RECORD_COUNT, titlePrefix: prefix });
      await page.clock.install();

      try {
        await openScreen(page, "/records", page.getByRole("button", { name: "기록 찾기" }));
        await page.getByRole("button", { name: "기록 찾기" }).click();
        await page.getByRole("searchbox", { name: "기록 찾기" }).fill(word);
        const links = page.getByRole("link", { name: new RegExp(prefix) });
        await expect(links).toHaveCount(60);
        await scrollToEnd(page);
        await expect(links).toHaveCount(RECORD_COUNT);
        const firstPageRequests: string[] = [];
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (url.pathname === "/api/records/search" && !url.searchParams.has("beforeId")) firstPageRequests.push(request.url());
        });
        const refreshed = page.waitForRequest((request) => isScreenRequest(request, "/records"));

        // Act: 받은 지 30분이 지나 앱으로 돌아오면 기록 탭 화면을 새로 받는다
        await page.clock.fastForward(31 * MINUTE_MS);
        await returnToApp(page);
        await refreshed;
        await page.waitForTimeout(1_000);

        // Assert
        expect(firstPageRequests).toEqual([]);
        await expect(links).toHaveCount(RECORD_COUNT);
      } finally {
        await deleteRecords();
      }
    });
  });
}
