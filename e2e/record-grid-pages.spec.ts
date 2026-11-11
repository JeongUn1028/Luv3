import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { isScreenRequest, returnToApp } from "./support/actions";
import { createDisposableRecords, getRecordIdsByTitle, renameRecord } from "./support/seed";
import { expect, getScrollArea, openScreen, test } from "./support/test";

/** 한 묶음(60개)보다 많게 만든다. 2000년 1월 1일부터 하루씩이라 1·2·3월에 걸친다 */
const RECORD_COUNT = 65;
const MINUTE_MS = 60_000;

const createPrefix = (): string => `E2E 그리드 ${randomUUID().slice(0, 8)}`;

const getRecordLink = (page: Page, title: string): Locator => page.getByRole("link", { name: new RegExp(`${title},`) });

const openRecords = (page: Page): Promise<void> => openScreen(page, "/records", page.getByRole("button", { name: "기록 찾기" }));

const scrollToEnd = (page: Page): Promise<void> => getScrollArea(page).evaluate((element) => element.scrollTo({ top: element.scrollHeight }));

/** 맨 아래로 내리기를 되풀이해, 다른 테스트의 기록이 많아 묶음이 여럿 더 필요해도 `link`가 붙을 때까지 이어 받는다 */
const loadUntilAttached = async (page: Page, link: Locator): Promise<void> => {
  await expect(async () => {
    await scrollToEnd(page);
    await expect(link).toBeAttached({ timeout: 1_000 });
  }).toPass({ timeout: 20_000 });
};

/** 그리드의 다음 묶음 요청(찾기가 아닌 것) */
const isGridNextPage = (url: URL): boolean =>
  url.pathname === "/api/records/search" && url.searchParams.has("beforeId") && !url.searchParams.has("q") && !url.searchParams.has("tag");

test.describe("기록 탭 그리드 나눠 받기", () => {
  test("처음에는 최근 기록만 받고, 내리면 다음 묶음을 이어 붙여 달 머리글이 한 번씩만 나온다", async ({ page }) => {
    // Arrange
    const prefix = createPrefix();
    const deleteRecords = await createDisposableRecords({ count: RECORD_COUNT, titlePrefix: prefix });

    try {
      await openRecords(page);
      const oldest = getRecordLink(page, `${prefix} 0`);
      await expect(oldest).toHaveCount(0);

      // Act
      await loadUntilAttached(page, oldest);

      // Assert
      await expect(page.getByRole("link", { name: new RegExp(`${prefix} \\d+,`) })).toHaveCount(RECORD_COUNT);
      for (const month of ["2000 · 01", "2000 · 02", "2000 · 03"]) {
        await expect(page.getByRole("heading", { name: month, exact: true })).toHaveCount(1);
      }
    } finally {
      await deleteRecords();
    }
  });

  test("다음 묶음을 받는 중에는 알려 주고, 받지 못하면 다시 불러오기로 이어 받는다", async ({ page }) => {
    // Arrange
    const prefix = createPrefix();
    const deleteRecords = await createDisposableRecords({ count: RECORD_COUNT, titlePrefix: prefix });
    let releaseFailure = (): void => undefined;
    const failureReleased = new Promise<void>((resolve) => {
      releaseFailure = resolve;
    });
    await page.route(isGridNextPage, async (route) => {
      await failureReleased;
      await route.abort();
    });

    try {
      await openRecords(page);

      // Act
      await scrollToEnd(page);

      // Assert
      await expect(page.getByRole("status").filter({ hasText: "불러오는 중…" })).toBeVisible();

      // Act
      releaseFailure();

      // Assert
      await expect(page.getByRole("alert").filter({ hasText: "더 불러오지 못했어요" })).toBeVisible();

      // Act
      await page.unroute(isGridNextPage);
      await page.getByRole("button", { name: "다시 불러오기" }).click();
      await loadUntilAttached(page, getRecordLink(page, `${prefix} 0`));

      // Assert
      await expect(page.getByRole("button", { name: "다시 불러오기" })).toHaveCount(0);
    } finally {
      await deleteRecords();
    }
  });

  test("이어 받은 기록의 상세에 갔다 돌아오면 다시 받지 않고 보던 자리를 보여 준다", async ({ page }) => {
    // Arrange
    const prefix = createPrefix();
    const deleteRecords = await createDisposableRecords({ count: RECORD_COUNT, titlePrefix: prefix });
    await page.clock.install();

    // 처음부터 다시 받으면 이미 받았던 자리를 다시 부른다. 나란히 도는 테스트의 기록이 뒤에 더 있으면 새 자리(다음 묶음)를 부르는 것은 괜찮다
    const requestedCursors: string[] = [];
    let isBack = false;
    const repeatedCursors: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (!isGridNextPage(url)) return;
      const cursor = url.searchParams.get("beforeId") ?? "";
      if (isBack && requestedCursors.includes(cursor)) repeatedCursors.push(cursor);
      requestedCursors.push(cursor);
    });

    try {
      await openRecords(page);
      const oldest = getRecordLink(page, `${prefix} 0`);
      await loadUntilAttached(page, oldest);
      await oldest.click();
      await page.getByRole("link", { name: "뒤로" }).waitFor();
      isBack = true;
      // 상세에 30분 넘게 있다 돌아오면 기록 탭 화면을 새로 받는다. 기록이 그대로면 이어 받은 기록을 지켜야 한다
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

  test("상대가 이어 받은 기록을 고친 뒤 화면을 새로 받으면 그 기록도 고친 대로 보인다", async ({ page }) => {
    // Arrange
    const prefix = createPrefix();
    const deleteRecords = await createDisposableRecords({ count: RECORD_COUNT, titlePrefix: prefix });
    await page.clock.install();

    try {
      await openRecords(page);
      await loadUntilAttached(page, getRecordLink(page, `${prefix} 0`));
      const [oldestId] = await getRecordIdsByTitle(`${prefix} 0`);
      if (!oldestId) throw new Error("가장 오래된 기록을 찾지 못했다");
      await renameRecord(oldestId, `${prefix} 상대가 고침`);

      // Act: 받은 지 30분이 지나 앱으로 돌아오면 기록 탭 화면을 새로 받는다
      await page.clock.fastForward(31 * MINUTE_MS);
      await returnToApp(page);

      // Assert
      await loadUntilAttached(page, getRecordLink(page, `${prefix} 상대가 고침`));
      await expect(getRecordLink(page, `${prefix} 0`)).toHaveCount(0);
    } finally {
      await deleteRecords();
    }
  });
});
