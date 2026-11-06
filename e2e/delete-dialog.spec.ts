import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createDisposableEvent, createDisposableRecord, createDisposableTodo, getRecordIdsByTitle, listRecordFiles } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const getCalendarTab = (page: Page) => page.getByRole("navigation", { name: "주요 화면" }).getByRole("link", { name: "캘린더" });

// 닫히지 않은 창이 앱을 통째로 막으면 탭 자리의 맨 위 요소가 문서 자체가 되어 눌러도 이동하지 않는다
const expectTabsToWork = async (page: Page): Promise<void> => {
  await getCalendarTab(page).tap();
  await page.waitForURL(/\/calendar/);
};

const confirmDelete = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true").click();
  await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
};

test.describe("삭제 확인 창", () => {
  test("기록을 지우면 파일까지 사라지고 다른 탭을 누를 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = `창 닫기 기록 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteRecord = await createDisposableRecord({ id, title });

    try {
      // Act
      await openScreen(page, `/dates/${id}`, page.getByRole("heading", { name: title }));
      await confirmDelete(page);
      await page.waitForURL(/\/records/);

      // Assert
      await expectTabsToWork(page);
      expect(await getRecordIdsByTitle(title)).toEqual([]);
      expect(await listRecordFiles(id)).toEqual([]);
    } finally {
      await deleteRecord();
    }
  });

  test("일정을 지우면 다른 탭을 누를 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = `창 닫기 일정 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteEvent = await createDisposableEvent({ id, title });

    try {
      // Act
      await openScreen(page, `/events/${id}/edit`, page.locator("#event-title"));
      await confirmDelete(page);
      await page.waitForURL(/\/calendar/);

      // Assert: 지운 뒤 도착한 화면이 캘린더이므로 다른 탭으로 눌러 본다
      await page.getByRole("navigation", { name: "주요 화면" }).getByRole("link", { name: "Todo" }).tap();
      await page.waitForURL(/\/todos/);
    } finally {
      await deleteEvent();
    }
  });

  test("할 일을 지우면 다른 탭을 누를 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: `창 닫기 할 일 ${testInfo.project.name} ${id.slice(0, 8)}` });

    try {
      // Act
      await openScreen(page, `/todos/${id}/edit`, page.getByRole("button", { name: "삭제", exact: true }));
      await confirmDelete(page);
      await page.waitForURL(/\/todos$/);

      // Assert
      await expectTabsToWork(page);
    } finally {
      await deleteTodo();
    }
  });

  test("지우지 못하면 창을 그대로 두고 다시 시도하게 한다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: `창 유지 할 일 ${testInfo.project.name} ${id.slice(0, 8)}` });
    await page.route("**/rest/v1/todos*", (route) => (route.request().method() === "DELETE" ? route.abort() : route.continue()));

    try {
      // Act
      await openScreen(page, `/todos/${id}/edit`, page.getByRole("button", { name: "삭제", exact: true }));
      await confirmDelete(page);

      // Assert
      await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("지우지 못했어요. 잠시 후 다시 시도해 주세요.");
      await expect(page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true })).toBeEnabled();
      expect(new URL(page.url()).pathname).toBe(`/todos/${id}/edit`);
    } finally {
      await deleteTodo();
    }
  });

  test("확인 창을 연 채 뒤로 가도 앱이 막히지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = `뒤로 가기 할 일 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteTodo = await createDisposableTodo({ id, content });

    try {
      await openScreen(page, "/todos", page.getByRole("link", { name: content }));
      await page.getByRole("link", { name: content }).click();
      await page.waitForURL(`**/todos/${id}/edit`);
      await page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true").click();
      await expect(page.getByRole("dialog")).toBeVisible();

      // Act: 아이폰 가장자리 밀기처럼 창을 닫지 않고 화면만 뒤로 간다
      await page.goBack();
      await page.waitForURL(/\/todos$/);

      // Assert
      await expectTabsToWork(page);
    } finally {
      await deleteTodo();
    }
  });
  test("지우는 요청이 도는 동안 벗어났다 돌아와도 요청을 또 보내지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = `요청 한 번 할 일 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteTodo = await createDisposableTodo({ id, content });
    let deleteRequests = 0;
    let releaseRequest = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/rest/v1/todos*", async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      deleteRequests += 1;
      await held;
      return route.continue();
    });

    try {
      await openScreen(page, "/todos", page.getByRole("link", { name: content }));
      await page.getByRole("link", { name: content }).click();
      await page.waitForURL(`**/todos/${id}/edit`);
      await confirmDelete(page);
      await expect(page.getByRole("dialog").getByRole("button", { name: "지우는 중…" })).toBeDisabled();

      // Act
      await page.goBack();
      await page.waitForURL(/\/todos$/);
      await page.goForward();
      await page.waitForURL(`**/todos/${id}/edit`);
      await page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true").click();

      // Assert
      await expect(page.getByRole("dialog").getByRole("button", { name: "지우는 중…" })).toBeDisabled();
      expect(deleteRequests).toBe(1);
    } finally {
      releaseRequest();
      await deleteTodo();
    }
  });
});

test("커플 사진 메뉴를 연 채 뒤로 가도 앱이 막히지 않는다", async ({ page }) => {
  // Arrange
  await openScreen(page, "/records", getCalendarTab(page));
  await page.getByRole("navigation", { name: "주요 화면" }).getByRole("link", { name: "홈" }).click();
  await page.getByRole("button", { name: "커플 사진 바꾸기" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();

  // Act
  await page.goBack();
  await page.waitForURL(/\/records/);

  // Assert
  await expectTabsToWork(page);
});
