import { randomInt, randomUUID } from "node:crypto";
import type { Locator, Page, Response } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { createTestName } from "./support/names";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 하고 싶은 것의 완료·되돌리기·순서 바꾸기가 저장돼 새로 고침 뒤에도 남는지(#258)

/**
 * 테스트가 만드는 두 항목의 순서 값. 새 항목은 DB가 이어지는 작은 값을 붙이므로, 아주 큰 값의 이웃한 두 값을 쓰면
 * 나란히 도는 테스트가 만든 항목이 둘 사이에 끼지 않는다. 한 칸 옮기기는 바로 위·아래 항목과 자리를 바꾸기 때문이다
 */
const pickAdjacentSortOrders = (): [number, number] => {
  const first = 1_000_000_000_000 + randomInt(1_000_000_000) * 2;
  return [first, first + 1];
};

const getOpenList = (page: Page): Locator => page.getByRole("list", { name: "하고 싶은 것" }).locator("visible=true");
const getDoneSection = (page: Page): Locator => page.getByRole("region", { name: /^완료 \d+$/ }).locator("visible=true");

/** 하지 않은 항목 목록에서 `below`가 `above`보다 몇 칸 아래인지. 둘 중 하나라도 목록에 없으면 undefined다 */
const readOrderGap = async (page: Page, above: string, below: string): Promise<number | undefined> => {
  const contents = await getOpenList(page).getByRole("link").allTextContents();
  const [aboveIndex, belowIndex] = [contents.indexOf(above), contents.indexOf(below)];
  return aboveIndex === -1 || belowIndex === -1 ? undefined : belowIndex - aboveIndex;
};

const isTodoSave = (response: Response, method: "PATCH" | "POST"): boolean =>
  response.request().method() === method && /\/rest\/v1\/(todos|rpc\/move_todo)/.test(response.url());

/** 버튼을 누른 저장이 끝날 때까지 기다린다. 화면은 저장 전에 먼저 바뀌므로, 끝나기 전에 새로 고치면 저장되지 않은 화면을 보게 된다 */
const waitForSave = async (page: Page, method: "PATCH" | "POST", act: () => Promise<void>): Promise<void> => {
  const saved = page.waitForResponse((response) => isTodoSave(response, method));
  await act();
  expect((await saved).ok()).toBe(true);
};

const reloadTodos = async (page: Page, content: string): Promise<void> => {
  await page.reload();
  await page.getByRole("link", { name: content, exact: true }).locator("visible=true").waitFor();
};

test.describe("하고 싶은 것 진행", () => {
  test("완료를 체크하면 완료 묶음으로 옮겨 저장되고, 체크를 풀면 원래 자리로 돌아온다", async ({ page }, testInfo) => {
    // Arrange
    const [firstOrder, secondOrder] = pickAdjacentSortOrders();
    const first = { id: randomUUID(), content: createTestName("E2E 완료할 항목", testInfo) };
    const second = { id: randomUUID(), content: createTestName("E2E 그대로 둘 항목", testInfo) };
    const deleteFirst = await createDisposableTodo({ ...first, sortOrder: firstOrder });
    const deleteSecond = await createDisposableTodo({ ...second, sortOrder: secondOrder });

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: second.content, exact: true }));

      // Act
      await waitForSave(page, "PATCH", () => page.getByRole("checkbox", { name: `${first.content} 완료` }).locator("visible=true").check());

      // Assert
      await expect(getDoneSection(page).getByRole("link", { name: first.content, exact: true })).toBeVisible();
      await reloadTodos(page, second.content);
      await expect(getDoneSection(page).getByRole("link", { name: first.content, exact: true })).toBeVisible();
      await expect(getOpenList(page).getByRole("link", { name: first.content, exact: true })).toHaveCount(0);
      await expect(page.getByRole("checkbox", { name: `${first.content} 완료` }).locator("visible=true")).toBeChecked();

      // Act
      await waitForSave(page, "PATCH", () => page.getByRole("checkbox", { name: `${first.content} 완료` }).locator("visible=true").uncheck());

      // Assert: 순서 값은 그대로라 완료하기 전처럼 두 번째 항목 바로 위로 돌아온다
      await reloadTodos(page, first.content);
      await expect(getDoneSection(page).getByRole("link", { name: first.content, exact: true })).toHaveCount(0);
      await expect(page.getByRole("checkbox", { name: `${first.content} 완료` }).locator("visible=true")).not.toBeChecked();
      expect(await readOrderGap(page, first.content, second.content)).toBe(1);
    } finally {
      await deleteFirst();
      await deleteSecond();
    }
  });

  test("위로 옮기기를 누르면 바로 위 항목과 자리를 바꿔 저장하고, 새로 고쳐도 바뀐 순서를 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const [upperOrder, lowerOrder] = pickAdjacentSortOrders();
    const upper = { id: randomUUID(), content: createTestName("E2E 위에 있던 항목", testInfo) };
    const lower = { id: randomUUID(), content: createTestName("E2E 올릴 항목", testInfo) };
    const deleteUpper = await createDisposableTodo({ ...upper, sortOrder: upperOrder });
    const deleteLower = await createDisposableTodo({ ...lower, sortOrder: lowerOrder });

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: lower.content, exact: true }));
      expect(await readOrderGap(page, upper.content, lower.content)).toBe(1);

      // Act
      await waitForSave(page, "POST", () => page.getByRole("button", { name: `${lower.content} 위로 옮기기` }).locator("visible=true").tap());

      // Assert
      await expect.poll(() => readOrderGap(page, lower.content, upper.content)).toBe(1);
      await reloadTodos(page, lower.content);
      expect(await readOrderGap(page, lower.content, upper.content)).toBe(1);
    } finally {
      await deleteUpper();
      await deleteLower();
    }
  });
});
