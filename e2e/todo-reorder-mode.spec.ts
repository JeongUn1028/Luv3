import { randomInt, randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { HOME_PATH } from "@/lib/auth/paths";
import { TODOS_PATH } from "@/lib/todos/list";
import { getTab } from "./support/actions";
import { createTestName } from "./support/names";
import { createDisposableEvent, createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 하고 싶은 것 구역 나누기와 순서 바꾸기 편집 모드(#497)

/**
 * 테스트가 만드는 항목의 순서 값. 아주 큰 값의 이웃한 값을 쓰면 나란히 도는 테스트가 만든 항목이 사이에 끼지 않는다.
 * 한 칸 옮기기는 같은 구역의 바로 위·아래 항목과 자리를 바꾸기 때문이다
 */
const pickAdjacentSortOrders = (count: number): number[] => {
  const first = 3_000_000_000_000 + randomInt(1_000_000_000) * count;
  return Array.from({ length: count }, (_, index) => first + index);
};

const getMain = (page: Page): Locator => page.locator("main").locator("visible=true");
const getList = (page: Page, name: "일정 잡힌 것" | "아직"): Locator => getMain(page).getByRole("list", { name, exact: true });
const getReorderButton = (page: Page, name: "순서 바꾸기" | "끝"): Locator => getMain(page).getByRole("button", { name, exact: true });
const getAddLink = (page: Page): Locator => page.getByRole("link", { name: "하고 싶은 것 추가" }).locator("visible=true");

/** 목록에서 `contents`가 보이는 차례(다른 테스트 항목은 뺀다). 일정 잡힌 줄은 내용 뒤에 날짜 칩 글자가 붙어 앞부분으로 찾는다 */
const readOrder = async (list: Locator, contents: string[]): Promise<string[]> =>
  (await list.getByRole("link").allTextContents()).flatMap((text) => contents.find((content) => text.startsWith(content)) ?? []);

/** 바로 다음 주 같은 요일부터 `days`일 뒤의 날짜(YYYY-MM-DD). 일정 잡힌 것 구역의 날짜순을 재는 데 쓴다 */
const toFutureDate = (days: number): string => new Date(Date.now() + (7 + days) * 86_400_000).toISOString().slice(0, 10);

test.describe("하고 싶은 것 순서 바꾸기 편집", () => {
  test("평소에는 화살표가 없고, '순서 바꾸기'를 누른 동안만 옮길 수 있으며 체크·고치기·추가는 막힌다", async ({ page }, testInfo) => {
    // Arrange
    const [upperOrder, lowerOrder] = pickAdjacentSortOrders(2);
    const upper = { id: randomUUID(), content: createTestName("E2E 편집 위", testInfo), sortOrder: upperOrder };
    const lower = { id: randomUUID(), content: createTestName("E2E 편집 아래", testInfo), sortOrder: lowerOrder };
    const contents = [upper.content, lower.content];
    const deletes = await Promise.all([createDisposableTodo(upper), createDisposableTodo(lower)]);

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: lower.content, exact: true }));
      await expect(page.getByRole("button", { name: `${lower.content} 위로 옮기기` })).toHaveCount(0);

      // Act
      await getReorderButton(page, "순서 바꾸기").tap();

      // Assert: 편집 중에는 체크·고치기·추가를 막는다
      await expect(getReorderButton(page, "끝")).toBeVisible();
      await expect(page.getByRole("checkbox", { name: `${lower.content} 완료` }).locator("visible=true")).toBeDisabled();
      await expect(getList(page, "아직").getByRole("link", { name: lower.content, exact: true })).toHaveAttribute("aria-disabled", "true");
      await expect(getAddLink(page)).toHaveAttribute("aria-disabled", "true");

      // Act
      const saved = page.waitForResponse((response) => response.url().includes("/rest/v1/rpc/move_todo") && response.ok());
      await page.getByRole("button", { name: `${lower.content} 위로 옮기기` }).locator("visible=true").tap();
      await saved;
      await getReorderButton(page, "끝").tap();

      // Assert: 화살표가 사라지고 새로 고쳐도 바뀐 순서가 남는다
      await expect(page.getByRole("button", { name: `${lower.content} 위로 옮기기` })).toHaveCount(0);
      await expect(getAddLink(page)).not.toHaveAttribute("aria-disabled", "true");
      await expect.poll(() => readOrder(getList(page, "아직"), contents)).toEqual([lower.content, upper.content]);
      await page.reload();
      await page.getByRole("link", { name: lower.content, exact: true }).locator("visible=true").waitFor();
      expect(await readOrder(getList(page, "아직"), contents)).toEqual([lower.content, upper.content]);
    } finally {
      await Promise.all(deletes.map((remove) => remove()));
    }
  });

  test("다른 탭으로 갔다 돌아오면 편집이 끝나 있다", async ({ page }, testInfo) => {
    // Arrange
    const [firstOrder, secondOrder] = pickAdjacentSortOrders(2);
    const first = { id: randomUUID(), content: createTestName("E2E 탭 이동 첫째", testInfo), sortOrder: firstOrder };
    const second = { id: randomUUID(), content: createTestName("E2E 탭 이동 둘째", testInfo), sortOrder: secondOrder };
    const deletes = await Promise.all([createDisposableTodo(first), createDisposableTodo(second)]);

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: second.content, exact: true }));
      await getReorderButton(page, "순서 바꾸기").tap();
      await expect(getReorderButton(page, "끝")).toBeVisible();

      // Act
      await getTab(page, HOME_PATH).tap();
      await page.locator(`nav a[href="${HOME_PATH}"][aria-current="page"]`).locator("visible=true").waitFor();
      await getTab(page, TODOS_PATH).tap();

      // Assert
      await expect(getReorderButton(page, "순서 바꾸기")).toBeVisible();
      await expect(page.getByRole("button", { name: `${second.content} 위로 옮기기` })).toHaveCount(0);
      await expect(page.getByRole("checkbox", { name: `${second.content} 완료` }).locator("visible=true")).toBeEnabled();
      await expect(getAddLink(page)).not.toHaveAttribute("aria-disabled", "true");
    } finally {
      await Promise.all(deletes.map((remove) => remove()));
    }
  });

  test("일정 잡힌 것은 날짜순으로 따로 모이고, '아직'에서 옮기면 사이에 낀 일정 잡힌 항목을 건너뛴다", async ({ page }, testInfo) => {
    // Arrange: 순서 값은 아직 위 → 늦은 일정 → 이른 일정 → 아직 아래
    const sortOrders = pickAdjacentSortOrders(4);
    const [upper, lateScheduled, soonScheduled, lower] = ["아직 위", "늦은 일정", "이른 일정", "아직 아래"].map((label, index) => ({
      id: randomUUID(),
      content: createTestName(`E2E 구역 ${label}`, testInfo),
      sortOrder: sortOrders[index],
    }));
    if (!upper || !lateScheduled || !soonScheduled || !lower) throw new Error("항목이 모자랍니다");
    const lateEvent = { id: randomUUID(), title: createTestName("E2E 늦은 일정", testInfo), date: toFutureDate(5) };
    const soonEvent = { id: randomUUID(), title: createTestName("E2E 이른 일정", testInfo), date: toFutureDate(1) };
    const deleteEvents = await Promise.all([createDisposableEvent(lateEvent), createDisposableEvent(soonEvent)]);
    const deleteTodos = await Promise.all([
      createDisposableTodo(upper),
      createDisposableTodo({ ...lateScheduled, eventId: lateEvent.id }),
      createDisposableTodo({ ...soonScheduled, eventId: soonEvent.id }),
      createDisposableTodo(lower),
    ]);
    const unscheduledContents = [upper.content, lower.content];

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: lower.content, exact: true }));

      // Assert: 일정 잡힌 것은 날짜가 가까운 것부터, 아직인 것은 정한 순서대로
      expect(await readOrder(getList(page, "일정 잡힌 것"), [lateScheduled.content, soonScheduled.content])).toEqual([soonScheduled.content, lateScheduled.content]);
      expect(await readOrder(getList(page, "아직"), unscheduledContents)).toEqual(unscheduledContents);

      // Act
      await getReorderButton(page, "순서 바꾸기").tap();
      await expect(getList(page, "일정 잡힌 것").getByRole("button", { name: /옮기기$/ })).toHaveCount(0);
      const saved = page.waitForResponse((response) => response.url().includes("/rest/v1/rpc/move_todo") && response.ok());
      await page.getByRole("button", { name: `${lower.content} 위로 옮기기` }).locator("visible=true").tap();
      await saved;

      // Assert: 새로 고쳐도 아직 아래가 아직 위보다 위에 있다
      await page.reload();
      await page.getByRole("link", { name: lower.content, exact: true }).locator("visible=true").waitFor();
      expect(await readOrder(getList(page, "아직"), unscheduledContents)).toEqual([lower.content, upper.content]);
    } finally {
      await Promise.all(deleteTodos.map((remove) => remove()));
      await Promise.all(deleteEvents.map((remove) => remove()));
    }
  });
});

test.describe("홈 하고 싶은 것 칸", () => {
  test("일정 잡힌 항목은 맨 위 순서여도 보여 주지 않는다", async ({ page }, testInfo) => {
    // Arrange: 어떤 항목보다 위에 오는 순서 값을 준다
    const scheduled = { id: randomUUID(), content: createTestName("E2E 홈 일정 잡힌 것", testInfo), sortOrder: -2_000_000_000_000_000 - randomInt(1_000_000) };
    const event = { id: randomUUID(), title: createTestName("E2E 홈 일정", testInfo), date: toFutureDate(2) };
    const deleteEvent = await createDisposableEvent(event);
    // 처음부터 이어 만든다. 만든 뒤 이으면 그사이 홈 맨 위 세 개를 읽는 다른 테스트를 밀어낸다
    const deleteTodo = await createDisposableTodo({ ...scheduled, eventId: event.id });

    try {
      // Act
      await openScreen(page, HOME_PATH, page.getByRole("region", { name: "하고 싶은 것" }));

      // Assert
      await expect(page.getByRole("region", { name: "하고 싶은 것" }).getByText(scheduled.content)).toHaveCount(0);
    } finally {
      await deleteTodo();
      await deleteEvent();
    }
  });
});
