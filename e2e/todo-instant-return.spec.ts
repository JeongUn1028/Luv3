import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { returnToApp, getSubmitButton } from "./support/actions";
import { readAnimations, recordAnimations } from "./support/motion";
import { createDisposableTodo, deleteTodosByContent, getTodoContent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

// 할 일을 저장하면 저장을 기다리지 않고 바로 목록으로 돌아가고, 저장 중인 항목을 흐리게 먼저 보여 준다(#345)

const TODOS_URL = "**/rest/v1/todos*";
const MINUTE_MS = 60_000;

/** 저장 요청을 붙들어 두었다가 `release`로 보낸다. `finish`를 주면 보내는 대신 그 응답을 준다 */
const holdSaveRequest = async (page: Page, finish: (route: Route) => Promise<void> = (route) => route.continue()) => {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let markRequested = (): void => undefined;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(TODOS_URL, async (route) => {
    if (route.request().method() === "GET") return route.continue();
    markRequested();
    await released;
    return finish(route);
  });
  return { requested, release };
};

const getContentField = (page: Page): Locator => page.locator("#todo-content").locator("visible=true");

const getListRow = (page: Page, content: string): Locator => page.locator("main li").filter({ hasText: content }).locator("visible=true");

const getCheckbox = (page: Page, content: string): Locator => page.getByRole("checkbox", { name: `${content} 완료` }).locator("visible=true");

/** 목록에서 + 를 눌러 새 항목 폼을 연다. 뒤로 가기로 돌아갈 목록이 기록에 남는다 */
const openNewFormFromList = async (page: Page): Promise<void> => {
  await openScreen(page, TODOS_PATH, page.locator("main").locator("visible=true").first());
  await page.locator('main a[href="/todos/new"]').locator("visible=true").first().tap();
  await page.waitForURL("**/todos/new");
  await getContentField(page).waitFor();
};

test.describe("새 하고 싶은 것을 저장하면", () => {
  test("저장이 끝나기 전에 목록으로 돌아가 흐린 항목을 먼저 보여 주고, 저장이 끝나면 같은 자리에서 원래 모양이 된다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 바로 돌아가기", testInfo);
    await openNewFormFromList(page);
    await getContentField(page).fill(content);
    const save = await holdSaveRequest(page);

    try {
      // Act
      await getSubmitButton(page).tap();
      await save.requested;

      // Assert: 저장 응답 전인데 목록이다
      await page.waitForURL(`**${TODOS_PATH}`);
      const row = getListRow(page, content);
      await expect(row).toBeVisible();
      await expect(getCheckbox(page, content)).toBeDisabled();
      await expect(row.getByRole("button", { name: `${content} 위로 옮기기` })).toHaveAttribute("aria-disabled", "true");
      await expect(row.getByRole("link")).toHaveAttribute("aria-disabled", "true");
      await expect(row).toContainText("(저장 중)");
      const pendingElement = await row.elementHandle();

      // Act
      save.release();

      // Assert: 서버 목록으로 바뀌어도 같은 줄 요소가 그대로 남는다(지웠다 다시 그리지 않아 깜빡이지 않는다).
      // 위치는 나란히 도는 다른 테스트가 같은 목록에 항목을 넣고 지워 바뀔 수 있어 재지 않는다
      await expect(getCheckbox(page, content)).toBeEnabled();
      await expect(row).not.toContainText("(저장 중)");
      expect(await pendingElement?.evaluate((element) => element.isConnected)).toBe(true);
      // 돌아간 목록이 이미 보여 주므로 "저장했어요" 알림은 띄우지 않는다
      await expect(page.getByRole("status").filter({ hasText: "하고 싶은 것을 저장했어요" })).toHaveCount(0);
    } finally {
      await deleteTodosByContent(content);
    }
  });

  test("저장보다 먼저 목록을 새로 받아도 저장 중인 항목이 사라지지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 먼저 새로 받음", testInfo);
    const partnerContent = createTestName("E2E 상대가 더함", testInfo);
    await page.clock.install();
    await openNewFormFromList(page);
    await getContentField(page).fill(content);
    const save = await holdSaveRequest(page);
    const deletePartnerTodo = await createDisposableTodo({ id: randomUUID(), content: partnerContent });

    try {
      await getSubmitButton(page).tap();
      await save.requested;
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(getListRow(page, content)).toBeVisible();

      // Act: 30분 뒤 앱에 돌아와 화면을 새로 받는다. 저장 전이라 서버 목록에는 아직 없다
      await page.clock.fastForward(31 * MINUTE_MS);
      await returnToApp(page);

      // Assert: 새로 받은 목록(상대가 더한 항목이 보임)에서도 저장 중인 항목이 남는다
      await expect(getListRow(page, partnerContent)).toBeVisible();
      await expect(getListRow(page, content)).toBeVisible();
      await expect(getCheckbox(page, content)).toBeDisabled();

      save.release();
      await expect(getCheckbox(page, content)).toBeEnabled();
    } finally {
      await deleteTodosByContent(content);
      await deletePartnerTodo();
    }
  });

  test("저장에 실패하면 먼저 보여 준 항목을 빼고 알리며, 돌아가면 쓴 내용이 남아 있다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 바로 돌아가 실패", testInfo);
    await openNewFormFromList(page);
    await getContentField(page).fill(content);
    const save = await holdSaveRequest(page, (route) => route.fulfill({ status: 400, json: { code: "23514", message: "E2E 거절" } }));

    try {
      await getSubmitButton(page).tap();
      await save.requested;
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(getListRow(page, content)).toBeVisible();

      // Act
      save.release();

      // Assert
      const notice = page.getByRole("alert").filter({ hasText: "하고 싶은 것을 저장하지 못했어요" });
      await expect(notice).toBeVisible();
      await expect(getListRow(page, content)).toHaveCount(0);

      await notice.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL("**/todos/new");
      await expect(getContentField(page)).toHaveValue(content);
    } finally {
      await deleteTodosByContent(content);
    }
  });
});

test("하고 싶은 것을 고쳐 저장하면 목록으로 바로 돌아가 고친 내용을 먼저 보여 준다", async ({ page }, testInfo) => {
  // Arrange
  const id = randomUUID();
  const content = createTestName("E2E 고쳐 바로 돌아가기", testInfo);
  const fixedContent = `${content} 고침`;
  const deleteTodo = await createDisposableTodo({ id, content });
  try {
    await openScreen(page, TODOS_PATH, getListRow(page, content));
    await getListRow(page, content).getByRole("link").tap();
    await page.waitForURL(`**/todos/${id}/edit`);
    await getContentField(page).fill(fixedContent);
    const save = await holdSaveRequest(page);

    // Act
    await getSubmitButton(page).tap();
    await save.requested;

    // Assert
    await page.waitForURL(`**${TODOS_PATH}`);
    await expect(getCheckbox(page, fixedContent)).toBeDisabled();
    save.release();
    await expect(getCheckbox(page, fixedContent)).toBeEnabled();
    await expect.poll(() => getTodoContent(id)).toBe(fixedContent);
  } finally {
    await deleteTodo();
  }
});

test.describe("움직임", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("저장하고 돌아갈 때 뒤로 버튼을 누른 것처럼 왼쪽에서 밀려 들어온다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 돌아가는 움직임", testInfo);
    await openNewFormFromList(page);
    await getContentField(page).fill(content);
    await recordAnimations(page);

    try {
      // Act
      await getSubmitButton(page).tap();
      await page.waitForURL(`**${TODOS_PATH}`);

      // Assert
      await expect.poll(() => readAnimations(page)).toContain("screen-slide-in");
    } finally {
      await deleteTodosByContent(content);
    }
  });
});
