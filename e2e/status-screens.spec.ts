import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { RETRY_FAILED_MESSAGE } from "@/lib/load-retry";
import { TODOS_PATH } from "@/lib/todos/list";
import { getTab, isScreenRequest } from "./support/actions";
import { expect, openScreen, test } from "./support/test";

// 없는 화면 안내와 로딩 뼈대(#195에서 코드 글자 검사를 옮김), 오류 화면(#258)

const MISSING_SCREENS = [
  { name: "없는 주소", path: "/e2e-missing", title: "화면을 찾을 수 없어요", description: "없어졌거나 주소가 잘못됐어요.", link: "홈으로", target: "/" },
  { name: "없는 기록", path: `/dates/${randomUUID()}`, title: "기록을 찾을 수 없어요", description: "지워졌거나 주소가 잘못됐어요.", link: "기록 목록으로", target: RECORDS_PATH },
  { name: "없는 일정", path: `/events/${randomUUID()}/edit`, title: "일정을 찾을 수 없어요", description: "지워졌거나 주소가 잘못됐어요.", link: "캘린더로", target: CALENDAR_PATH },
  { name: "없는 항목", path: `/todos/${randomUUID()}/edit`, title: "항목을 찾을 수 없어요", description: "지워졌거나 주소가 잘못됐어요.", link: "목록으로", target: TODOS_PATH },
];

test.describe("없는 화면", () => {
  for (const { name, path, title, description, link, target } of MISSING_SCREENS) {
    test(`${name} 화면을 열면 안내와 돌아갈 링크를 보여 주고, 누르면 그 화면으로 간다`, async ({ page }) => {
      // Arrange
      await openScreen(page, path, page.getByRole("heading", { name: title }));

      // Act
      await expect(page.getByText(description).locator("visible=true")).toBeVisible();
      await page.getByRole("link", { name: link, exact: true }).locator("visible=true").tap();

      // Assert
      await page.waitForURL((url) => url.pathname === target);
    });
  }
});

test.describe("로딩 뼈대", () => {
  for (const path of ["/", RECORDS_PATH, "/settings"]) {
    test(`${path} 화면을 기다리는 동안 화면 읽기 프로그램에 불러오는 중이라고 알린다`, async ({ browser, context, viewport }) => {
      // Arrange: JavaScript를 끄면 스트리밍된 내용이 끼워지지 않아 뼈대가 그대로 남는다
      const skeletonContext = await browser.newContext({ viewport, storageState: await context.storageState(), javaScriptEnabled: false });
      const page = await skeletonContext.newPage();

      try {
        // Act
        await page.goto(path);

        // Assert
        await expect(page.locator("main").getByRole("status").filter({ hasText: "불러오는 중이에요" }).first()).toBeAttached();
      } finally {
        await skeletonContext.close();
      }
    });
  }
});

/**
 * `path` 화면으로 옮길 때 받는 화면 내용(RSC)을 도중에 끊는다. 화면을 받다가 연결이 끊긴 것처럼 React가 "Connection closed"로 실패해 오류 화면(`error.tsx`)을 그린다.
 * 서버가 Supabase를 부르다 실패하는 오류는 서버 안의 요청이라 page.route로 만들 수 없어, 브라우저가 받는 응답을 끊는 이 방법을 쓴다.
 * 빈 응답·상태 500을 주면 Next가 문서를 새로 받아(MPA 이동) 오류 화면이 나오지 않는다. 미리 받기는 끊지 않아 이동 요청만 실패한다
 */
const cutScreenResponse = async (page: Page, path: string): Promise<void> => {
  await page.route(
    (url) => url.pathname === path,
    async (route) => {
      if (!isScreenRequest(route.request(), path)) return route.continue();
      const response = await route.fetch();
      const body = await response.body();
      return route.fulfill({ status: response.status(), contentType: response.headers()["content-type"], body: body.subarray(0, Math.floor(body.length / 2)) });
    },
  );
};

/** 기록 목록에서 캘린더 탭으로 옮기다 응답이 끊겨 오류 화면이 나온 상태로 만든다 */
const openErrorScreen = async (page: Page): Promise<void> => {
  // 화면을 열기 전에 걸어, 열면서 시작된 요청도 놓치지 않는다
  await cutScreenResponse(page, CALENDAR_PATH);
  await openScreen(page, RECORDS_PATH, getTab(page, CALENDAR_PATH));
  await getTab(page, CALENDAR_PATH).tap();
  await expect(page.getByRole("heading", { name: "문제가 생겼어요" }).locator("visible=true")).toBeVisible();
};

test.describe("오류 화면", () => {
  test("화면을 받다가 연결이 끊기면 오류 화면을 알리고, 다시 시도가 또 실패하면 그렇다고 알리고, 연결되면 그 화면을 그린다", async ({ page }) => {
    // Arrange
    await openErrorScreen(page);
    const retryButton = page.getByRole("button", { name: "다시 시도", exact: true }).locator("visible=true");

    // Assert: 쓰던 화면이 바뀌었으므로 화면 읽기 프로그램에 바로 알린다
    await expect(page.getByRole("alert").filter({ hasText: "잠시 후 다시 시도해 주세요." }).locator("visible=true")).toBeVisible();

    // Act
    await retryButton.tap();

    // Assert
    await expect(page.getByRole("alert").filter({ hasText: RETRY_FAILED_MESSAGE }).locator("visible=true")).toBeVisible();

    // Act
    await page.unrouteAll({ behavior: "wait" });
    await retryButton.tap();

    // Assert
    await expect(page.getByRole("link", { name: "이전 달" }).locator("visible=true")).toBeVisible();
    await expect(page.getByRole("heading", { name: "문제가 생겼어요" }).locator("visible=true")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe(CALENDAR_PATH);
  });

  test("오류 화면에서 홈으로를 누르면 홈 문서를 새로 받아 그린다", async ({ page }) => {
    // Arrange: 오류 화면이 다시 받는 화면 내용이 테스트가 끝난 뒤까지 붙들려 있지 않게 끊기를 푼다
    await openErrorScreen(page);
    await page.unrouteAll({ behavior: "ignoreErrors" });
    const documentRequests: string[] = [];
    page.on("request", (request) => {
      if (request.isNavigationRequest()) documentRequests.push(new URL(request.url()).pathname);
    });

    // Act
    await page.getByRole("link", { name: "홈으로" }).locator("visible=true").tap();

    // Assert
    await page.waitForURL((url) => url.pathname === "/");
    await expect(page.getByRole("region", { name: "커플 사진" }).locator("visible=true")).toBeVisible();
    await expect(page.getByRole("heading", { name: "문제가 생겼어요" }).locator("visible=true")).toHaveCount(0);
    expect(documentRequests).toContain("/");
  });
});
