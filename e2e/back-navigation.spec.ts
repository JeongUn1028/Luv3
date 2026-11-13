import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { BASE_URL, PHOTO_RECORD } from "./support/constants";
import { createDisposableRecord, createDisposableTodo, renameRecord } from "./support/seed";
import { expect, getScrollArea, openScreen, test } from "./support/test";
import { getTab, getVisibleLink } from "./support/actions";
import { createTestName } from "./support/names";

const DETAIL_PATH = `/dates/${PHOTO_RECORD.id}`;

const getBackButton = (page: Page): Locator => page.getByRole("link", { name: "뒤로" }).locator("visible=true");
const getHistoryIndex = (page: Page): Promise<number> => page.evaluate(() => window.navigation?.currentEntry?.index ?? -1);

/** 스크롤할 내용이 모자라도 재도록 스크롤 영역에 높이를 더한다 */
const makeScrollable = (page: Page): Promise<void> =>
  getScrollArea(page).locator("visible=true").evaluate((element) => {
    const spacer = document.createElement("div");
    spacer.style.cssText = "height: 2000px; flex-shrink: 0";
    element.append(spacer);
  });

const scrollTo = (page: Page, top: number): Promise<void> =>
  getScrollArea(page).locator("visible=true").evaluate((element, value) => {
    element.scrollTop = value;
  }, top);

const getScrollTop = (page: Page): Promise<number> =>
  getScrollArea(page).locator("visible=true").evaluate((element) => element.scrollTop);

/** 다음 이동 동안 프레임마다 뼈대가 보였는지와 화면 전환 움직임을 모은다 */
const startWatching = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const seen = { skeleton: false, animations: [] as string[] };
    const sample = () => {
      // 뼈대만 "불러오는 중이에요"를 알린다. 댓글 남김 안내처럼 다른 화면 읽기용 알림도 role="status"를 쓴다
      const statuses = [...document.querySelectorAll<HTMLElement>('main [role="status"]')];
      if (statuses.some((element) => element.offsetParent !== null && element.textContent?.includes("불러오는 중이에요"))) seen.skeleton = true;
      for (const animation of document.getAnimations()) {
        const { pseudoElement } = animation.effect as KeyframeEffect;
        const name = (animation as CSSAnimation).animationName;
        if (pseudoElement?.startsWith("::view-transition-new") && !seen.animations.includes(name)) seen.animations.push(name);
      }
      requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
    Object.assign(window, { seenWhileWatching: seen });
  });

const getWatched = (page: Page): Promise<{ skeleton: boolean; animations: string[] }> =>
  page.evaluate(() => (window as unknown as { seenWhileWatching: { skeleton: boolean; animations: string[] } }).seenWhileWatching);

const openDetailFromList = async (page: Page): Promise<void> => {
  await openScreen(page, RECORDS_PATH, getVisibleLink(page, DETAIL_PATH));
  await getVisibleLink(page, DETAIL_PATH).tap();
  await page.waitForURL(`**${DETAIL_PATH}`);
  await page.getByRole("heading", { name: PHOTO_RECORD.title }).locator("visible=true").waitFor();
};

test.describe("뒤로 버튼", () => {
  test("목록에서 들어온 상세에서 누르면 기록을 되돌아가 뼈대 없이 보던 자리로 돌아간다", async ({ page }) => {
    // Arrange
    await openScreen(page, RECORDS_PATH, getVisibleLink(page, DETAIL_PATH));
    await makeScrollable(page);
    await scrollTo(page, 200);
    // tap은 링크가 보이도록 스크롤을 옮기므로 그 자리에서 누른다
    await getVisibleLink(page, DETAIL_PATH).evaluate((element: HTMLElement) => element.click());
    await page.waitForURL(`**${DETAIL_PATH}`);
    await page.getByRole("heading", { name: PHOTO_RECORD.title }).locator("visible=true").waitFor();
    await page.waitForLoadState("networkidle");
    const indexOnDetail = await getHistoryIndex(page);
    await startWatching(page);
    const serverRequests: string[] = [];
    page.on("request", (request) => {
      // 새로 보이는 링크의 미리 받기는 화면을 다시 불러오는 요청이 아니다
      if (request.headers()["next-router-prefetch"]) return;
      if (request.url().includes("_rsc=") || request.url().includes("/storage/v1/object/")) serverRequests.push(request.url());
    });

    // Act
    await getBackButton(page).tap();
    await page.waitForURL(`**${RECORDS_PATH}`);
    await expect(getVisibleLink(page, DETAIL_PATH)).toBeVisible();
    await page.waitForTimeout(1000);

    // Assert: 30초 안에 돌아왔으니 서버에 다시 묻지 않는다
    expect(await getHistoryIndex(page)).toBe(indexOnDetail - 1);
    expect((await getWatched(page)).skeleton).toBe(false);
    expect(await getScrollTop(page)).toBeCloseTo(200, -1);
    expect(serverRequests).toEqual([]);
  });

  test("주소로 바로 들어온 상세에서 누르면 정해진 주소로 간다", async ({ page }) => {
    // Arrange
    await openScreen(page, DETAIL_PATH, page.getByRole("heading", { name: PHOTO_RECORD.title }));

    // Act
    await getBackButton(page).tap();

    // Assert
    await page.waitForURL(`**${RECORDS_PATH}`);
    await expect(getVisibleLink(page, DETAIL_PATH)).toBeVisible();
  });

  test("다른 곳에서 넘어온 상세에서 누르면 그곳으로 돌아가지 않고 정해진 주소로 간다", async ({ page }) => {
    // Arrange
    await page.route("http://other-app.test/**", (route) =>
      route.fulfill({ contentType: "text/html; charset=utf-8", body: `<a href="${BASE_URL}${DETAIL_PATH}">기록 열기</a>` }),
    );
    await page.goto("http://other-app.test/");
    await page.getByRole("link", { name: "기록 열기" }).tap();
    await page.getByRole("heading", { name: PHOTO_RECORD.title }).locator("visible=true").waitFor();
    await page.waitForLoadState("networkidle");

    // Act
    await getBackButton(page).tap();

    // Assert
    await page.waitForURL(`**${RECORDS_PATH}`);
  });

  test("정해진 주소가 아닌 화면에서 들어왔어도 그 화면으로 돌아간다", async ({ page }) => {
    // Arrange: 정해진 주소는 이번 달 캘린더다
    await openScreen(page, "/calendar?month=2020-01", page.getByRole("link", { name: "일정 추가", exact: true }));
    await page.getByRole("link", { name: "일정 추가", exact: true }).locator("visible=true").tap();
    await page.waitForURL("**/events/new*");
    await page.locator("#event-title").locator("visible=true").waitFor();

    // Act
    await getBackButton(page).tap();

    // Assert
    await page.waitForURL("**/calendar?month=2020-01");
  });

  test("끊긴 동안 눌러도 숨겨 둔 목록으로 돌아간다", async ({ page, context }) => {
    // Arrange
    await openDetailFromList(page);
    await context.setOffline(true);

    try {
      // Act
      await getBackButton(page).tap();

      // Assert
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(getVisibleLink(page, DETAIL_PATH)).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });

  test("고쳐서 저장한 뒤 상세에서 누르면 같은 상세가 아니라 그 앞 화면으로 돌아간다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 뒤로 저장", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });
    try {
      await openScreen(page, RECORDS_PATH, getVisibleLink(page, `/dates/${id}`));
      await getVisibleLink(page, `/dates/${id}`).tap();
      await getVisibleLink(page, `/dates/${id}/edit`).tap();
      await page.locator("#memo").locator("visible=true").waitFor();
      await page.locator("#title").locator("visible=true").fill(`${title} 고침`);
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(`**/dates/${id}`);
      await page.getByRole("heading", { name: `${title} 고침` }).locator("visible=true").waitFor();

      // Act
      await getBackButton(page).tap();

      // Assert: 고친 제목이 숨겨 둔 목록에도 보인다
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: `${title} 고침` })).toBeVisible();
    } finally {
      await deleteRecord();
    }
  });

  test("상세를 보는 사이 상대가 제목을 고치고 30초가 지났으면 돌아온 목록에 고친 제목이 보인다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 뒤로 상대", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });
    try {
      await page.clock.install();
      await openScreen(page, RECORDS_PATH, getVisibleLink(page, `/dates/${id}`));
      await getVisibleLink(page, `/dates/${id}`).tap();
      await page.getByRole("heading", { name: title }).locator("visible=true").waitFor();
      await renameRecord(id, `${title} 상대가 고침`);
      await page.clock.fastForward(31_000);

      // Act
      await getBackButton(page).tap();
      await page.waitForURL(`**${RECORDS_PATH}`);

      // Assert
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: `${title} 상대가 고침` })).toBeVisible();
    } finally {
      await deleteRecord();
    }
  });

  test("로그인이 풀린 뒤 돌아오면 로그인 화면으로 넘기지 않고 돌아온 화면에 남는다", async ({ page }) => {
    // Arrange: 새로 불러올 만큼 시간이 지난 상태를 만든다
    await page.clock.install();
    await openDetailFromList(page);
    await page.context().clearCookies();
    await page.clock.fastForward(31_000);

    // Act
    await getBackButton(page).tap();
    await page.waitForURL(`**${RECORDS_PATH}`);
    await page.waitForTimeout(1000);

    // Assert
    expect(new URL(page.url()).pathname).toBe(RECORDS_PATH);
    await expect(getVisibleLink(page, DETAIL_PATH)).toBeVisible();
  });

  test("고치는 사이 상대가 지운 항목은 30초 안에 돌아와도 목록에서 사라진다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("E2E 뒤로 지움", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });
    try {
      await openScreen(page, TODOS_PATH, page.getByText(content));
      await getVisibleLink(page, `${TODOS_PATH}/${id}/edit`).tap();
      await page.getByRole("button", { name: "저장", exact: true }).waitFor();
      await deleteTodo();

      // Act: 저장을 기다리지 않고 바로 목록으로 돌아간다(#345). 목록은 지워진 것을 알기 전에 숨겨 둔 그대로다
      await page.getByRole("button", { name: "저장", exact: true }).click();
      await page.waitForURL(`**${TODOS_PATH}`);

      // Assert: 저장이 "이미 지워졌어요"로 실패하면 보고 있는 목록을 새로 받는다
      await expect(page.getByRole("alert").filter({ hasText: "이미 지워졌어요" })).toBeVisible();
      await expect(page.locator("main").locator("visible=true").getByText(content)).toHaveCount(0);
    } finally {
      await deleteTodo();
    }
  });

  test("빠르게 두 번 눌러도 두 칸 돌아가지 않는다", async ({ page }) => {
    // Arrange: 목록 → 상세 → 고치기
    await openDetailFromList(page);
    await getVisibleLink(page, `${DETAIL_PATH}/edit`).tap();
    await page.locator("#memo").locator("visible=true").waitFor();
    const indexOnForm = await getHistoryIndex(page);

    // Act: 첫 번째로 상세가 나온 뒤에 같은 자리의 뒤로 버튼을 또 누른다
    await getBackButton(page).evaluate((element: HTMLElement) => {
      element.click();
      element.click();
    });
    await page.waitForURL(`**${DETAIL_PATH}`);
    await page.getByRole("heading", { name: PHOTO_RECORD.title }).locator("visible=true").waitFor();
    await getBackButton(page).evaluate((element: HTMLElement) => element.click());
    await page.waitForTimeout(100);

    // Assert
    expect(new URL(page.url()).pathname).toBe(DETAIL_PATH);
    expect(await getHistoryIndex(page)).toBe(indexOnForm - 1);
  });

  test.describe("움직임", () => {
    test.use({ contextOptions: { reducedMotion: "no-preference" } });

    test("뒤로 버튼으로 돌아오면 왼쪽에서 밀려 들어온다", async ({ page }) => {
      // Arrange
      await openDetailFromList(page);
      await startWatching(page);

      // Act
      await getBackButton(page).tap();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(getVisibleLink(page, DETAIL_PATH)).toBeVisible();

      // Assert
      await expect.poll(async () => (await getWatched(page)).animations).toContain("screen-slide-in");
    });

    test("브라우저 뒤로 가기(iOS 가장자리 밀기)로 돌아오면 앱이 움직임을 더하지 않는다", async ({ page }) => {
      // Arrange
      await openDetailFromList(page);
      await startWatching(page);

      // Act
      await page.goBack();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(getVisibleLink(page, DETAIL_PATH)).toBeVisible();
      await page.waitForTimeout(400);

      // Assert
      expect((await getWatched(page)).animations).not.toContain("screen-slide-in");
    });

    test("지금 탭을 다시 누르면 맨 위로 부드럽게 올라간다", async ({ page }) => {
      // Arrange
      await openScreen(page, RECORDS_PATH, getTab(page, RECORDS_PATH));
      await makeScrollable(page);
      await scrollTo(page, 800);
      const urlBefore = page.url();

      // Act
      await getTab(page, RECORDS_PATH).tap();

      // Assert
      await expect.poll(() => getScrollTop(page)).toBe(0);
      expect(page.url()).toBe(urlBefore);
    });
  });
});

test.describe("지금 탭 다시 누르기", () => {
  test("모션 줄이기 설정이면 움직임 없이 바로 맨 위로 옮긴다", async ({ page }) => {
    // Arrange
    await openScreen(page, RECORDS_PATH, getTab(page, RECORDS_PATH));
    await makeScrollable(page);
    await scrollTo(page, 800);

    // Act: 눌린 그 프레임 안에서 잰다
    const topRightAfterClick = await getTab(page, RECORDS_PATH).evaluate((element: HTMLElement) => {
      element.click();
      return [...document.querySelectorAll<HTMLElement>("main > .overflow-y-auto")].find((area) => area.offsetParent !== null)?.scrollTop;
    });

    // Assert
    expect(topRightAfterClick).toBe(0);
  });

  test("맨 위로 올린 뒤 다른 탭에 다녀와도 맨 위에 있다", async ({ page }) => {
    // Arrange
    await openScreen(page, RECORDS_PATH, getTab(page, RECORDS_PATH));
    await makeScrollable(page);
    await scrollTo(page, 800);
    await getTab(page, RECORDS_PATH).tap();
    await expect.poll(() => getScrollTop(page)).toBe(0);

    // Act
    await getTab(page, TODOS_PATH).tap();
    await page.waitForURL(`**${TODOS_PATH}`);
    await getTab(page, RECORDS_PATH).tap();
    await page.waitForURL(`**${RECORDS_PATH}`);

    // Assert
    await expect.poll(() => getScrollTop(page)).toBe(0);
  });

  test("다른 달을 보던 캘린더 탭을 다시 누르면 이번 달로 돌아간다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/calendar?month=2020-01", getTab(page, "/calendar"));

    // Act
    await getTab(page, "/calendar").tap();

    // Assert
    await page.waitForURL(/\/calendar$/);
  });
});
