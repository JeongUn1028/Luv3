import { randomInt, randomUUID } from "node:crypto";
import type { Locator, Page, Request, Route } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { getSubmitButton } from "./support/actions";
import { readAnimations, recordAnimations } from "./support/motion";
import { createTestName } from "./support/names";
import { createDisposableTodo, deleteTodosByContent } from "./support/seed";
import { expect, getScrollArea, openScreen, test } from "./support/test";

// 할 일 순서 바꾸기·새 항목 표시·완료 움직임(#347)

/**
 * 테스트가 만드는 항목들의 이어진 순서 값. 아주 큰 값에서 무작위로 고르므로 나란히 도는 테스트의 항목이 사이에 끼지 않는다.
 * 한 칸 옮기기는 바로 위·아래 항목과 자리를 바꾸기 때문이다
 */
const pickAdjacentSortOrders = (count: number): number[] => {
  const first = 2_000_000_000_000 + randomInt(1_000_000_000) * count;
  return Array.from({ length: count }, (_, index) => first + index);
};

const getOpenList = (page: Page): Locator => page.getByRole("list", { name: "아직", exact: true }).locator("visible=true");
const getDoneSection = (page: Page): Locator => page.getByRole("region", { name: /^완료 \d+$/ }).locator("visible=true");
const getListRow = (page: Page, content: string): Locator => page.locator("main li").filter({ hasText: content }).locator("visible=true");
const getCheckbox = (page: Page, content: string): Locator => page.getByRole("checkbox", { name: `${content} 완료` }).locator("visible=true");

/** 하지 않은 항목 목록에서 `contents`가 보이는 차례(다른 테스트 항목은 뺀다) */
const readOrder = async (page: Page, contents: string[]): Promise<string[]> =>
  (await getOpenList(page).getByRole("link").allTextContents()).filter((text) => contents.includes(text));

const isMoveRequest = (request: Request): boolean => request.method() === "POST" && request.url().includes("/rest/v1/rpc/move_todo");

/** 할 일 목록을 서버에서 다시 받는 요청(router.refresh). 링크 미리 받기는 세지 않는다 */
const isListRefresh = (request: Request): boolean => {
  const headers = request.headers();
  return headers.rsc === "1" && headers["next-router-prefetch"] === undefined && new URL(request.url()).pathname === TODOS_PATH;
};

/** 페이지가 보낸 요청 수를 센다 */
const countRequests = (page: Page, matches: (request: Request) => boolean): { read: () => number } => {
  let count = 0;
  page.on("request", (request) => {
    if (matches(request)) count += 1;
  });
  return { read: () => count };
};

test.describe("할 일 순서 바꾸기", () => {
  test("연달아 세 칸 옮기면 화면은 누를 때마다 바뀌고, 목록 새로 고침은 마지막에 한 번만 한다", async ({ page }, testInfo) => {
    // Arrange
    const sortOrders = pickAdjacentSortOrders(4);
    const todos = ["가", "나", "다", "라"].map((label, index) => ({
      id: randomUUID(),
      content: createTestName(`E2E 연달아 옮기기 ${label}`, testInfo),
      sortOrder: sortOrders[index],
    }));
    const contents = todos.map(({ content }) => content);
    const deletes = await Promise.all(todos.map((todo) => createDisposableTodo(todo)));
    const [moving] = contents;
    if (!moving) throw new Error("옮길 항목이 없습니다");

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: moving, exact: true }));
      const moves = countRequests(page, isMoveRequest);
      const refreshes = countRequests(page, isListRefresh);
      const movesDone = Promise.all(
        [0, 1, 2].map((index) => page.waitForResponse((response) => isMoveRequest(response.request()) && response.ok(), { timeout: 15_000 * (index + 1) })),
      );

      // Act: 순서는 편집 모드에서만 바꾼다(#497). 저장을 기다리지 않고 세 번 누른다
      await page.locator("main").locator("visible=true").getByRole("button", { name: "순서 바꾸기", exact: true }).tap();
      const moveDown = page.getByRole("button", { name: `${moving} 아래로 옮기기` }).locator("visible=true");
      await moveDown.tap();
      await expect.poll(() => readOrder(page, contents)).toEqual([contents[1], moving, contents[2], contents[3]]);
      await moveDown.tap();
      await expect.poll(() => readOrder(page, contents)).toEqual([contents[1], contents[2], moving, contents[3]]);
      await moveDown.tap();

      // Assert
      await expect.poll(() => readOrder(page, contents)).toEqual([contents[1], contents[2], contents[3], moving]);
      await movesDone;
      // 마지막 저장 뒤 잠깐 기다렸다 한 번 새로 받는다(save-batch.ts). 그 뒤로 더 받지 않는지도 본다
      await expect.poll(() => refreshes.read(), { timeout: 10_000 }).toBe(1);
      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(1500);
      expect(moves.read()).toBe(3);
      expect(refreshes.read()).toBe(1);
      expect(await readOrder(page, contents)).toEqual([contents[1], contents[2], contents[3], moving]);
      await page.reload();
      await page.getByRole("link", { name: moving, exact: true }).locator("visible=true").waitFor();
      expect(await readOrder(page, contents)).toEqual([contents[1], contents[2], contents[3], moving]);
    } finally {
      await Promise.all(deletes.map((remove) => remove()));
    }
  });
});

/** 새 항목 저장 요청을 붙들어 둔다. 돌아온 목록이 저장 중인 항목(목록 맨 아래)을 보여 주는 동안 잰다 */
const holdNewTodoSave = async (page: Page): Promise<{ release: () => void }> => {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/todos*", async (route: Route) => {
    if (route.request().method() !== "POST") return route.continue();
    await released;
    return route.continue();
  });
  return { release };
};

test.describe("새 할 일", () => {
  test("저장하고 목록으로 돌아오면 맨 위를 보고 있었어도 새 항목이 보이게 스크롤하고 잠깐 표시한다", async ({ page }, testInfo) => {
    // Arrange: 목록이 화면보다 길어 맨 아래의 새 항목이 처음 화면 밖에 있게 한다
    const sortOrders = pickAdjacentSortOrders(14);
    const fillers = sortOrders.map((sortOrder, index) => ({ id: randomUUID(), content: createTestName(`E2E 긴 목록 ${index + 1}`, testInfo), sortOrder }));
    const deletes = await Promise.all(fillers.map((todo) => createDisposableTodo(todo)));
    const content = createTestName("E2E 새로 더한 항목", testInfo);
    const save = await holdNewTodoSave(page);

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: fillers[0]?.content ?? "", exact: true }));
      await getScrollArea(page).evaluate((element) => element.scrollTo({ top: 0 }));
      await page.locator('main a[href="/todos/new"]').locator("visible=true").first().tap();
      await page.waitForURL("**/todos/new");
      await page.locator("#todo-content").locator("visible=true").fill(content);

      // Act
      await getSubmitButton(page).tap();
      await page.waitForURL(`**${TODOS_PATH}`);

      // Assert
      const row = getListRow(page, content);
      await expect(row).toBeInViewport();
      await expect(row).toHaveAttribute("data-just-added", "true");
      // 잠깐만 표시한다
      await expect(row).not.toHaveAttribute("data-just-added", "true", { timeout: 5000 });
    } finally {
      save.release();
      await deleteTodosByContent(content);
      await Promise.all(deletes.map((remove) => remove()));
    }
  });
});

test.describe("완료 움직임", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("완료를 누르면 그 자리에서 줄을 긋고 잠깐 머문 뒤 완료 칸으로 옮긴다", async ({ page }, testInfo) => {
    // Arrange
    const [sortOrder] = pickAdjacentSortOrders(1);
    const todo = { id: randomUUID(), content: createTestName("E2E 줄 긋고 옮길 항목", testInfo), sortOrder };
    const remove = await createDisposableTodo(todo);

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: todo.content, exact: true }));
      await recordAnimations(page);

      // Act
      await getCheckbox(page, todo.content).check();

      // Assert: 바로 옮기지 않고 하지 않은 목록에서 체크된 채 줄을 긋는다
      await expect(getOpenList(page).getByRole("link", { name: todo.content, exact: true })).toBeVisible();
      await expect(getCheckbox(page, todo.content)).toBeChecked();
      await expect.poll(() => readAnimations(page)).toContain("todo-strike");
      // 그 뒤 완료 칸으로 옮긴다
      await expect(getDoneSection(page).getByRole("link", { name: todo.content, exact: true })).toBeVisible();
      await expect(getOpenList(page).getByRole("link", { name: todo.content, exact: true })).toHaveCount(0);
      await expect(getCheckbox(page, todo.content)).toBeChecked();
    } finally {
      await remove();
    }
  });
});
