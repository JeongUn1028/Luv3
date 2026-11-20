import { randomInt, randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { HOME_PATH, SETTINGS_PATH } from "@/lib/auth/paths";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { TODOS_PATH } from "@/lib/todos/list";
import { getCalendarEventRow, getSubmitButton, getTab, signInToHome } from "./support/actions";
import { createTestName } from "./support/names";
import {
  createDisposableEvent,
  createDisposableMember,
  createDisposableTodo,
  deleteTodosByContent,
  getTodoListView,
  linkTodoEvent,
  setTodoListView,
} from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 하고 싶은 것 '목록 보기' 설정과 탭 모양(#497 PR ②)

// 목록 보기는 사람마다 하나라 전용 계정을 바꾸면 나란히 도는 다른 테스트의 목록 모양이 바뀐다. 테스트마다 임시 계정을 쓴다
test.use({ storageState: { cookies: [], origins: [] } });

/** 나란히 도는 테스트의 항목이 사이에 끼지 않게 아주 큰 값에서 이어진 순서 값을 고른다 */
const pickAdjacentSortOrders = (count: number): number[] => {
  const first = 3_000_000_000_000 + randomInt(1_000_000_000) * count;
  return Array.from({ length: count }, (_, index) => first + index);
};

/** 바로 다음 주 같은 요일부터 `days`일 뒤의 날짜(YYYY-MM-DD) */
const toFutureDate = (days: number): string => new Date(Date.now() + (7 + days) * 86_400_000).toISOString().slice(0, 10);

// 다른 테스트가 쓰지 않는 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 일정이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2041-08" : "2041-07");

const getMain = (page: Page): Locator => page.locator("main").locator("visible=true");
const getTodoTab = (page: Page, label: "일정 잡힌 것" | "아직" | "완료"): Locator => getMain(page).getByRole("tab", { name: new RegExp(`^${label} \\d+$`) });
const getList = (page: Page, name: "일정 잡힌 것" | "아직" | "완료"): Locator => getMain(page).getByRole("list", { name, exact: true });
const getViewRadio = (page: Page, name: "구역으로" | "탭으로"): Locator => getMain(page).getByRole("radio", { name, exact: true });
const getAddLink = (page: Page): Locator => page.getByRole("link", { name: "하고 싶은 것 추가" }).locator("visible=true");
const readTabCount = async (tab: Locator): Promise<number> => Number((await tab.textContent())?.match(/\d+$/)?.[0]);

test.describe("하고 싶은 것 목록 보기", () => {
  let memberId: string;
  let removeMember: (() => Promise<void>) | undefined;

  /** 임시 계정으로 로그인해 홈까지 연다 */
  const signInAsNewMember = async (page: Page): Promise<void> => {
    const password = randomUUID();
    const member = await createDisposableMember(password);
    memberId = member.id;
    removeMember = member.remove;
    await signInToHome(page, member.email, password);
  };

  test.afterEach(async () => {
    await removeMember?.();
    removeMember = undefined;
  });

  test("설정에서 '탭으로'를 고르면 하고 싶은 것이 탭 3개로 보이고, 화면을 열 때마다 '아직' 탭이다", async ({ page }, testInfo) => {
    // Arrange
    const [scheduledOrder, unscheduledOrder] = pickAdjacentSortOrders(2);
    const scheduled = { id: randomUUID(), content: createTestName("E2E 보기 일정 잡힌 것", testInfo), sortOrder: scheduledOrder };
    const unscheduled = { id: randomUUID(), content: createTestName("E2E 보기 아직", testInfo), sortOrder: unscheduledOrder };
    const event = { id: randomUUID(), title: createTestName("E2E 보기 일정", testInfo), date: toFutureDate(1) };
    const deleteEvent = await createDisposableEvent(event);
    const deleteTodos = await Promise.all([createDisposableTodo({ ...scheduled, eventId: event.id }), createDisposableTodo(unscheduled)]);
    await signInAsNewMember(page);

    try {
      // 처음에는 구역 모양이다
      await getTab(page, TODOS_PATH).tap();
      await expect(getList(page, "아직").getByRole("link", { name: unscheduled.content, exact: true })).toBeVisible();
      await expect(getMain(page).getByRole("tablist")).toHaveCount(0);

      // Act
      await getTab(page, HOME_PATH).tap();
      await page.getByRole("link", { name: "설정" }).tap();
      await expect(getViewRadio(page, "구역으로")).toBeChecked();
      const saved = page.waitForResponse((response) => response.url().includes("/rest/v1/rpc/set_todo_list_view") && response.ok());
      await getViewRadio(page, "탭으로").tap();
      await saved;
      await page.goBack();
      await getTab(page, TODOS_PATH).tap();

      // Assert: 탭 3개, '아직' 탭이 열려 일정 잡힌 것은 보이지 않는다
      await expect(getTodoTab(page, "아직")).toHaveAttribute("aria-selected", "true");
      await expect(getList(page, "아직").getByRole("link", { name: unscheduled.content, exact: true })).toBeVisible();
      await expect(getMain(page).getByRole("link", { name: new RegExp(`^${scheduled.content}`) })).toHaveCount(0);

      // Act
      await getTodoTab(page, "일정 잡힌 것").tap();

      // Assert
      await expect(getTodoTab(page, "일정 잡힌 것")).toHaveAttribute("aria-selected", "true");
      await expect(getList(page, "일정 잡힌 것").getByRole("link", { name: new RegExp(`^${scheduled.content}`) })).toBeVisible();

      // Act: 다른 탭에 다녀오면 다시 '아직' 탭이다
      await getTab(page, HOME_PATH).tap();
      await page.locator(`nav a[href="${HOME_PATH}"][aria-current="page"]`).locator("visible=true").waitFor();
      await getTab(page, TODOS_PATH).tap();

      // Assert
      await expect(getTodoTab(page, "아직")).toHaveAttribute("aria-selected", "true");
      expect(await getTodoListView(memberId)).toBe("tabs");
      await openScreen(page, SETTINGS_PATH, getViewRadio(page, "탭으로"));
      await expect(getViewRadio(page, "탭으로")).toBeChecked();
    } finally {
      await Promise.all(deleteTodos.map((remove) => remove()));
      await deleteEvent();
    }
  });

  test("탭 모양에서 체크하면 보던 탭에 남은 채 항목만 '완료'로 옮겨 가고, 새로 더하면 '아직' 탭에서 그 줄을 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const todo = { id: randomUUID(), content: createTestName("E2E 탭 체크", testInfo), sortOrder: pickAdjacentSortOrders(1)[0] };
    const added = createTestName("E2E 탭 추가", testInfo);
    const deleteTodo = await createDisposableTodo(todo);
    await signInAsNewMember(page);
    await setTodoListView(memberId, "tabs");

    try {
      await openScreen(page, TODOS_PATH, getList(page, "아직").getByRole("link", { name: todo.content, exact: true }));
      const doneCount = await readTabCount(getTodoTab(page, "완료"));

      // Act
      await page.getByRole("checkbox", { name: `${todo.content} 완료` }).locator("visible=true").tap();

      // Assert: '아직' 탭에 남고, 항목은 '완료' 탭으로 옮겨 간다
      await expect(getList(page, "아직").getByRole("link", { name: todo.content, exact: true })).toHaveCount(0);
      await expect(getTodoTab(page, "아직")).toHaveAttribute("aria-selected", "true");
      await expect.poll(() => readTabCount(getTodoTab(page, "완료"))).toBe(doneCount + 1);
      await getTodoTab(page, "완료").tap();
      await expect(getList(page, "완료").getByRole("link", { name: todo.content, exact: true })).toBeVisible();

      // Act: '완료' 탭을 보다 새로 더한다
      await getAddLink(page).tap();
      await page.waitForURL(`**${TODOS_PATH}/new`);
      await page.locator("#todo-content").locator("visible=true").fill(added);
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(getTodoTab(page, "아직")).toHaveAttribute("aria-selected", "true");
      await expect(getList(page, "아직").getByRole("link", { name: added, exact: true })).toBeVisible();
    } finally {
      await deleteTodo();
      await deleteTodosByContent(added);
    }
  });

  test("탭 모양에서도 순서 바꾸기·일정 잡기는 '아직' 탭에서 하고, 다른 탭으로 가면 편집이 끝난다", async ({ page }, testInfo) => {
    // Arrange
    const [firstOrder, secondOrder] = pickAdjacentSortOrders(2);
    const first = { id: randomUUID(), content: createTestName("E2E 탭 편집 첫째", testInfo), sortOrder: firstOrder };
    const second = { id: randomUUID(), content: createTestName("E2E 탭 편집 둘째", testInfo), sortOrder: secondOrder };
    const deletes = await Promise.all([createDisposableTodo(first), createDisposableTodo(second)]);
    await signInAsNewMember(page);
    await setTodoListView(memberId, "tabs");

    try {
      await openScreen(page, TODOS_PATH, getList(page, "아직").getByRole("link", { name: second.content, exact: true }));

      // Act
      await getMain(page).getByRole("button", { name: "순서 바꾸기", exact: true }).tap();

      // Assert
      await expect(page.getByRole("button", { name: `${second.content} 위로 옮기기` }).locator("visible=true")).toBeVisible();
      await expect(getAddLink(page)).toHaveAttribute("aria-disabled", "true");

      // Act: 다른 탭으로 가면 편집이 끝난다
      await getTodoTab(page, "완료").tap();
      await getTodoTab(page, "아직").tap();

      // Assert
      await expect(getMain(page).getByRole("button", { name: "순서 바꾸기", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: `${second.content} 위로 옮기기` })).toHaveCount(0);
      await expect(getAddLink(page)).not.toHaveAttribute("aria-disabled", "true");

      // Act: '완료' 탭을 보다 머리글의 '일정 잡기'를 누른다
      await getTodoTab(page, "완료").tap();
      await getMain(page).getByRole("button", { name: "일정 잡기", exact: true }).tap();

      // Assert: '아직' 탭으로 옮겨 고른다
      await expect(getTodoTab(page, "아직")).toHaveAttribute("aria-selected", "true");
      await expect(getMain(page).getByRole("checkbox", { name: `${first.content} 고르기` })).toBeVisible();
    } finally {
      await Promise.all(deletes.map((remove) => remove()));
    }
  });

  test("탭 모양에서 캘린더 일정 읽기 창의 하고 싶은 것을 누르면 '일정 잡힌 것' 탭을 열어 보여 주고, 같은 것을 다시 눌러 와도 그렇다", async ({ page }, testInfo) => {
    // Arrange
    const todo = { id: randomUUID(), content: createTestName("E2E 탭 캘린더에서", testInfo) };
    const date = `${getMonth(testInfo)}-12`;
    const event = { id: randomUUID(), title: createTestName("E2E 탭 캘린더 일정", testInfo), date };
    const deleteEvent = await createDisposableEvent(event);
    const deleteTodo = await createDisposableTodo(todo);
    await linkTodoEvent(todo.id, event.id);
    await signInAsNewMember(page);
    await setTodoListView(memberId, "tabs");
    const calendarPath = `${CALENDAR_PATH}?month=${date.slice(0, 7)}&date=${date}`;

    try {
      for (const round of [1, 2]) {
        // Act
        if (round === 1) await openScreen(page, calendarPath, getCalendarEventRow(page, event.title));
        else await page.goBack();
        await getCalendarEventRow(page, event.title).tap();
        await page.getByRole("dialog").getByRole("link", { name: todo.content }).tap();

        // Assert
        await page.waitForURL(`**${TODOS_PATH}`);
        await expect(getTodoTab(page, "일정 잡힌 것"), `${round}번째`).toHaveAttribute("aria-selected", "true");
        await expect(getList(page, "일정 잡힌 것").getByRole("link", { name: new RegExp(`^${todo.content}`) })).toBeInViewport();
      }
    } finally {
      await deleteTodo();
      await deleteEvent();
    }
  });
});
