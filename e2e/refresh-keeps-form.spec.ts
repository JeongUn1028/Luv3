import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Locator, Page, Request, Route } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { PHOTO_FIXTURE_PATH } from "./support/constants";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getTab } from "./support/actions";

const NEW_TODO_PATH = "/todos/new";

const getNewTodoLink = (page: Page): Locator => page.locator(`a[href="${NEW_TODO_PATH}"]`).locator("visible=true").first();
const getTodoContent = (page: Page): Locator => page.locator("#todo-content").locator("visible=true");

/** 저장 요청을 붙들어, 사용자가 폼으로 옮긴 뒤에 끝나게 한다 */
const holdSaveRequest = async (page: Page, url: string, finish: (route: Route) => Promise<void>) => {
  let releaseRequest = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let markRequested = (): void => undefined;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(url, async (route) => {
    if (route.request().method() === "GET") return route.continue();
    markRequested();
    await released;
    return finish(route);
  });
  return { requested, release: releaseRequest };
};

/** 홈에서 커플 사진을 올리기 시작하고 Todo 탭으로 옮긴다. 저장은 붙들어 둔다 */
const startCouplePhotoSaveAndGoToTodos = async (page: Page) => {
  // 커플 사진은 나란히 도는 테스트가 함께 쓰므로 실제로 바꾸지 않고 저장이 성공한 것처럼 돌려준다
  await openScreen(page, "/", page.getByRole("region", { name: "커플 사진" }));
  await page.route("**/storage/v1/object/album/couple/**", (route) =>
    route.request().method() === "POST" ? route.fulfill({ status: 200, json: { Key: "album/couple/e2e.jpg", Id: randomUUID() } }) : route.continue(),
  );
  const save = await holdSaveRequest(page, "**/rest/v1/rpc/set_couple_photo", (route) => route.fulfill({ status: 200, json: null }));
  await page.getByLabel("커플 사진 고르기").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO_FIXTURE_PATH) });
  await save.requested;
  await getTab(page, TODOS_PATH).tap();
  await page.waitForURL(`**${TODOS_PATH}`);
  return save;
};

/** 미리 받기가 아닌 화면 요청(이동과 다시 불러오기)인지 */
const isScreenRequest = (request: Request, pathname: string): boolean => {
  const headers = request.headers();
  return headers["rsc"] === "1" && headers["next-router-prefetch"] === undefined && new URL(request.url()).pathname === pathname;
};

test.describe("다른 화면의 저장이 끝나 새로 받을 때", () => {
  test("커플 사진을 올리는 사이 폼으로 옮겨 쓰고 있으면 쓰던 내용을 지우지 않고, 홈으로 돌아가면 새로 받는다", async ({ page }) => {
    // Arrange
    const save = await startCouplePhotoSaveAndGoToTodos(page);
    await getNewTodoLink(page).tap();
    await page.waitForURL(`**${NEW_TODO_PATH}`);
    await getTodoContent(page).fill("쓰던 하고 싶은 것");

    // Act
    save.release();

    // Assert: 다시 불러오면 폼이 새로 만들어져 비는 것을 잡으려면, 그 응답이 올 만큼 기다려야 한다
    await page.waitForTimeout(2_000);
    expect(new URL(page.url()).pathname).toBe(NEW_TODO_PATH);
    await expect(getTodoContent(page)).toHaveValue("쓰던 하고 싶은 것");

    // Assert: 미뤄 둔 새로 받기는 홈으로 돌아갈 때 한다
    await page.unrouteAll({ behavior: "wait" });
    await page.goBack();
    await page.waitForURL(`**${TODOS_PATH}`);
    const homeRefresh = page.waitForRequest((request) => request.headers()["rsc"] === "1" && new URL(request.url()).pathname === "/");
    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/");
    await homeRefresh;
  });

  test("커플 사진 저장이 폼으로 옮기는 중에 끝나도, 주소가 바뀌기 전이라 막 연 폼을 다시 불러오지 않는다", async ({ page }) => {
    // Arrange: 폼 화면 응답을 붙들어 옮기는 중인 때를 만든다
    const save = await startCouplePhotoSaveAndGoToTodos(page);
    await page.waitForLoadState("networkidle");
    const formRequests: Request[] = [];
    page.on("request", (request) => {
      if (isScreenRequest(request, NEW_TODO_PATH)) formRequests.push(request);
    });
    let releaseNavigation = (): void => undefined;
    const navigationReleased = new Promise<void>((resolve) => {
      releaseNavigation = resolve;
    });
    let markNavigationRequested = (): void => undefined;
    const navigationRequested = new Promise<void>((resolve) => {
      markNavigationRequested = resolve;
    });
    let isNavigationHeld = false;
    await page.route(`**${NEW_TODO_PATH}*`, async (route) => {
      // 첫 화면 요청(이동)만 붙든다. 그 뒤의 요청은 다시 불러오기다
      if (!isScreenRequest(route.request(), NEW_TODO_PATH) || isNavigationHeld) return route.continue();
      isNavigationHeld = true;
      markNavigationRequested();
      await navigationReleased;
      return route.continue();
    });
    await getNewTodoLink(page).tap();
    await navigationRequested;

    // Act
    save.release();
    await page.waitForTimeout(1_000);
    releaseNavigation();
    await page.waitForURL(`**${NEW_TODO_PATH}`);
    await getTodoContent(page).fill("옮기는 중에 쓴 것");

    // Assert: 다시 불러오면 폼 화면 요청이 하나 더 가고, 응답이 늦으면 쓰던 내용이 사라진다
    await page.waitForTimeout(2_000);
    expect(formRequests).toHaveLength(1);
    await expect(getTodoContent(page)).toHaveValue("옮기는 중에 쓴 것");
  });

  test("하고 싶은 것을 체크하는 사이 폼 링크를 누르면 저장이 끝난 뒤 폼이 열리고, 쓴 내용이 남으며, 목록에 돌아가면 체크돼 있다", async ({ page }, testInfo) => {
    // Arrange
    const content = `E2E 체크 중 폼 ${testInfo.project.name}`;
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content });
    try {
      await openScreen(page, TODOS_PATH, page.getByRole("checkbox", { name: `${content} 완료` }));
      const save = await holdSaveRequest(page, "**/rest/v1/todos*", (route) => route.continue());
      await page.getByRole("checkbox", { name: `${content} 완료` }).locator("visible=true").tap();
      await save.requested;
      await getNewTodoLink(page).tap();

      // Act
      save.release();
      await page.waitForURL(`**${NEW_TODO_PATH}`);
      await getTodoContent(page).fill("쓰던 하고 싶은 것");

      // Assert
      await page.waitForTimeout(2_000);
      expect(new URL(page.url()).pathname).toBe(NEW_TODO_PATH);
      await expect(getTodoContent(page)).toHaveValue("쓰던 하고 싶은 것");

      await page.unrouteAll({ behavior: "wait" });
      await page.goBack();
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(page.getByRole("checkbox", { name: `${content} 완료` }).locator("visible=true")).toBeChecked();
    } finally {
      await deleteTodo();
    }
  });
});
