import { randomInt, randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { getSubmitButton } from "./support/actions";
import { pickDate } from "./support/date-picker";
import { createTestName } from "./support/names";
import { createDisposableEvent, createDisposableTodo, deleteEventById, getTodoEventId } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 하고 싶은 것 탭에서 여러 개 골라 일정 잡기(#495): 머리글 '일정 잡기' → '아직' 구역에서 고르기 → 'N개로 일정 잡기' → 고른 것이 이어진 새 일정 폼

// 다른 테스트가 쓰지 않는 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 일정이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2041-10" : "2041-09");

/** 나란히 도는 테스트의 항목이 사이에 끼지 않게 아주 큰 값에서 이어진 순서 값을 고른다 */
const pickAdjacentSortOrders = (count: number): number[] => {
  const first = 3_000_000_000_000 + randomInt(1_000_000_000) * count;
  return Array.from({ length: count }, (_, index) => first + index);
};

const getMain = (page: Page): Locator => page.locator("main").locator("visible=true");
const getPickToggle = (page: Page, name: "일정 잡기" | "취소"): Locator => getMain(page).getByRole("button", { name, exact: true });
const getPickBox = (page: Page, content: string): Locator => getMain(page).getByRole("checkbox", { name: `${content} 고르기` });
// 고른 것이 없으면 막힌 버튼, 있으면 새 일정 폼으로 가는 링크다
const getPickBar = (page: Page): Locator => getMain(page).locator("a, button").filter({ hasText: /^(\d+개로 일정 잡기|잡을 것을 골라 주세요)$/ });
const getLinkedList = (page: Page): Locator => getMain(page).getByRole("list", { name: "하고 싶은 것", exact: true });

test.describe("하고 싶은 것 탭에서 여러 개 골라 일정 잡기(#495)", () => {
  test("둘을 골라 일정을 잡으면 목록 순서의 첫 번째가 제목인 폼이 열리고, 저장하면 둘 다 그 일정에 이어진다", async ({ page }, testInfo) => {
    // Arrange
    const [firstOrder, secondOrder] = pickAdjacentSortOrders(2);
    const [firstId, secondId] = [randomUUID(), randomUUID()];
    const first = createTestName("E2E 골라 잡기 첫째", testInfo);
    const second = createTestName("E2E 골라 잡기 둘째", testInfo);
    const deleteTodos = await Promise.all([
      createDisposableTodo({ id: firstId, content: first, sortOrder: firstOrder }),
      createDisposableTodo({ id: secondId, content: second, sortOrder: secondOrder }),
    ]);
    try {
      await openScreen(page, TODOS_PATH, getMain(page).getByRole("link", { name: first, exact: true }));

      // Act: 누른 순서는 둘째가 먼저다
      await getPickToggle(page, "일정 잡기").tap();
      await expect(getPickBar(page)).toHaveText("잡을 것을 골라 주세요");
      await expect(getPickBar(page)).toHaveAttribute("aria-disabled", "true");
      await getPickBox(page, second).tap();
      await getPickBox(page, first).tap();
      await expect(getPickBar(page)).toHaveText("2개로 일정 잡기");
      await getPickBar(page).tap();

      // Assert: 제목은 목록 순서의 첫 번째, 둘 다 이어진 채로 열린다
      const title = page.locator("#event-title").locator("visible=true");
      await expect(title).toHaveValue(first);
      await expect(getLinkedList(page).getByRole("listitem")).toHaveText([new RegExp(first), new RegExp(second)]);

      // Act
      await pickDate(page, "#event-date", `${getMonth(testInfo)}-05`);
      await getSubmitButton(page).tap();

      // Assert: 목록으로 돌아오고 두 줄 모두 날짜 칩이 붙는다
      await expect(page).toHaveURL(new RegExp(`${TODOS_PATH}$`));
      await expect.poll(() => getTodoEventId(firstId)).toBeDefined();
      expect(await getTodoEventId(secondId)).toBe(await getTodoEventId(firstId));
      const day = `${Number(getMonth(testInfo).slice(5))}월 5일`;
      for (const content of [first, second]) await expect(getMain(page).locator("li").filter({ hasText: content })).toContainText(day);
    } finally {
      const eventId = await getTodoEventId(firstId);
      if (eventId) await deleteEventById(eventId);
      for (const deleteTodo of deleteTodos) await deleteTodo();
    }
  });

  test("고르는 동안 일정 잡힌 것·완료한 것은 고를 수 없고 순서 바꾸기와 추가는 막히며, 취소하면 고른 것이 사라진다", async ({ page }, testInfo) => {
    // Arrange
    const [openId, scheduledId, doneId, eventId] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const open = createTestName("E2E 고를 것", testInfo);
    const scheduled = createTestName("E2E 이미 잡힌 것", testInfo);
    const done = createTestName("E2E 완료한 것", testInfo);
    const deleteEvent = await createDisposableEvent({ id: eventId, title: scheduled, date: `${getMonth(testInfo)}-12` });
    const deleteTodos = await Promise.all([
      createDisposableTodo({ id: openId, content: open }),
      createDisposableTodo({ id: scheduledId, content: scheduled, eventId }),
      createDisposableTodo({ id: doneId, content: done, completedAt: new Date().toISOString() }),
    ]);
    try {
      await openScreen(page, TODOS_PATH, getMain(page).getByRole("link", { name: open, exact: true }));

      // Act
      await getPickToggle(page, "일정 잡기").tap();

      // Assert
      await expect(getPickBox(page, open)).toBeVisible();
      await expect(getPickBox(page, scheduled)).toHaveCount(0);
      await expect(getPickBox(page, done)).toHaveCount(0);
      await expect(getMain(page).getByRole("region", { name: /^일정 잡힌 것/ })).toHaveAttribute("inert");
      await expect(getMain(page).getByRole("region", { name: /^완료/ })).toHaveAttribute("inert");
      await expect(getMain(page).getByRole("button", { name: "순서 바꾸기", exact: true })).toHaveCount(0);
      await expect(getMain(page).getByRole("link", { name: "하고 싶은 것 추가" })).toHaveAttribute("aria-disabled", "true");

      // Act: 고르고 취소한 뒤 다시 들어간다
      await getPickBox(page, open).tap();
      await expect(getPickBar(page)).toHaveText("1개로 일정 잡기");
      await getPickToggle(page, "취소").tap();

      // Assert: 체크 칸이 돌아오고, 다시 들어가면 고른 것이 없다
      await expect(getMain(page).getByRole("checkbox", { name: `${open} 완료` })).toBeEnabled();
      await getPickToggle(page, "일정 잡기").tap();
      await expect(getPickBox(page, open)).not.toBeChecked();
      await expect(getPickBar(page)).toHaveText("잡을 것을 골라 주세요");
    } finally {
      await deleteEvent();
      for (const deleteTodo of deleteTodos) await deleteTodo();
    }
  });

  test("고른 것 중 그사이 지워진 것이 있으면 빼고 폼을 열어 알린다", async ({ page }, testInfo) => {
    // Arrange
    const [keptId, goneId] = [randomUUID(), randomUUID()];
    const kept = createTestName("E2E 남은 것", testInfo);
    const deleteKept = await createDisposableTodo({ id: keptId, content: kept });
    const deleteGone = await createDisposableTodo({ id: goneId, content: createTestName("E2E 지워질 것", testInfo) });
    try {
      await deleteGone();

      // Act
      await openScreen(page, `/events/new?pick=${keptId}&pick=${goneId}`, page.locator("#event-title").locator("visible=true"));

      // Assert
      await expect(getLinkedList(page).getByRole("listitem")).toHaveText([new RegExp(kept)]);
      await expect(getMain(page)).toContainText("고른 것 중 1개는 그사이 일정이 잡혔거나 완료·삭제돼서 뺐어요.");
    } finally {
      await deleteKept();
    }
  });
});
