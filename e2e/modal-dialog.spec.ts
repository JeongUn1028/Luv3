import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { TODOS_PATH } from "@/lib/todos/list";
import { createDisposableEvent, createDisposableRecord, createDisposableTodo, getRecordIdsByTitle, listRecordFiles } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getSaveButton, getTab } from "./support/actions";
import { createTestName } from "./support/names";

// 창(ModalDialog)을 쓰는 화면의 동작을 모은 스펙(#196)

const getDeleteButton = (page: Page): Locator => page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true");
const getDialogDeleteButton = (page: Page): Locator => page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true });
const getSessionDialog = (page: Page): Locator => page.getByRole("dialog", { name: "다시 로그인해 주세요" });

// 닫히지 않은 창이 앱을 통째로 막으면 탭 자리의 맨 위 요소가 문서 자체가 되어 눌러도 이동하지 않는다
const expectTabsToWork = async (page: Page): Promise<void> => {
  await getTab(page, CALENDAR_PATH).tap();
  await page.waitForURL(/\/calendar/);
};

const confirmDelete = async (page: Page): Promise<void> => {
  await getDeleteButton(page).click();
  await getDialogDeleteButton(page).click();
};

/** 임시 할 일을 만들어 고치기 화면을 연다 */
const openDisposableTodo = async (page: Page, content: string): Promise<{ id: string; deleteTodo: () => Promise<void> }> => {
  const id = randomUUID();
  const deleteTodo = await createDisposableTodo({ id, content });
  await openScreen(page, `/todos/${id}/edit`, getDeleteButton(page));
  return { id, deleteTodo };
};

/** 할 일 지우기 요청을 붙들어 두고, 보낸 횟수를 센다 */
const holdTodoDelete = async (page: Page, finish: "continue" | "abort") => {
  let requests = 0;
  let release = (): void => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/rest/v1/todos*", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    requests += 1;
    await held;
    return finish === "abort" ? route.abort() : route.continue();
  });
  return { release, getRequests: () => requests };
};

test.describe("삭제 확인 창", () => {
  test("열면 제목과 설명을 읽을 수 있고 취소하면 닫히며 초점이 삭제 버튼으로 돌아간다", async ({ page }, testInfo) => {
    // Arrange
    const { deleteTodo } = await openDisposableTodo(page, createTestName("창 취소", testInfo));

    try {
      // Act
      await getDeleteButton(page).click();
      const dialog = page.getByRole("dialog", { name: "이 항목을 지울까요?" });
      await expect(dialog).toHaveAccessibleDescription(/지워져요/);
      await dialog.getByRole("button", { name: "취소" }).click();

      // Assert
      await expect(dialog).toBeHidden();
      await expect(getDeleteButton(page)).toBeFocused();
    } finally {
      await deleteTodo();
    }
  });

  test("Esc를 누르면 닫힌다", async ({ page }, testInfo) => {
    // Arrange
    const { deleteTodo } = await openDisposableTodo(page, createTestName("창 Esc", testInfo));

    try {
      // Act
      await getDeleteButton(page).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");

      // Assert
      await expect(page.getByRole("dialog")).toBeHidden();
    } finally {
      await deleteTodo();
    }
  });

  test("지우는 중에는 Esc를 눌러도 닫히지 않고, 지우지 못하면 창을 그대로 두고 다시 시도하게 한다", async ({ page }, testInfo) => {
    // Arrange
    const { id, deleteTodo } = await openDisposableTodo(page, createTestName("지우는 중 Esc", testInfo));
    const request = await holdTodoDelete(page, "abort");

    try {
      // Act
      await confirmDelete(page);
      await expect(page.getByRole("dialog").getByRole("button", { name: "지우는 중…" })).toBeDisabled();
      await page.keyboard.press("Escape");

      // Assert: 닫혔다면 아래 실패 문구를 볼 수 없다
      await expect(page.getByRole("dialog")).toBeVisible();
      request.release();
      await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("지우지 못했어요. 잠시 후 다시 시도해 주세요.");
      await expect(getDialogDeleteButton(page)).toBeEnabled();
      expect(new URL(page.url()).pathname).toBe(`/todos/${id}/edit`);
    } finally {
      request.release();
      await deleteTodo();
    }
  });

  test("기록을 지우면 파일까지 사라지고 다른 탭을 누를 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("창 닫기 기록", testInfo);
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
    const title = createTestName("창 닫기 일정", testInfo);
    const deleteEvent = await createDisposableEvent({ id, title });

    try {
      // Act
      await openScreen(page, `/events/${id}/edit`, page.locator("#event-title"));
      await confirmDelete(page);
      await page.waitForURL(/\/calendar/);

      // Assert: 지운 뒤 도착한 화면이 캘린더이므로 다른 탭으로 눌러 본다
      await getTab(page, TODOS_PATH).tap();
      await page.waitForURL(/\/todos/);
    } finally {
      await deleteEvent();
    }
  });

  test("할 일을 지우면 다른 탭을 누를 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const { deleteTodo } = await openDisposableTodo(page, createTestName("창 닫기 할 일", testInfo));

    try {
      // Act
      await confirmDelete(page);
      await page.waitForURL(/\/todos$/);

      // Assert
      await expectTabsToWork(page);
    } finally {
      await deleteTodo();
    }
  });

  test("확인 창을 연 채 뒤로 가도 앱이 막히지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("뒤로 가기 할 일", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: content }));
      await page.getByRole("link", { name: content }).click();
      await page.waitForURL(`**/todos/${id}/edit`);
      await getDeleteButton(page).click();
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
    const content = createTestName("요청 한 번 할 일", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });
    const request = await holdTodoDelete(page, "continue");

    try {
      await openScreen(page, TODOS_PATH, page.getByRole("link", { name: content }));
      await page.getByRole("link", { name: content }).click();
      await page.waitForURL(`**/todos/${id}/edit`);
      await confirmDelete(page);
      await expect(page.getByRole("dialog").getByRole("button", { name: "지우는 중…" })).toBeDisabled();

      // Act
      await page.goBack();
      await page.waitForURL(/\/todos$/);
      await page.goForward();
      await page.waitForURL(`**/todos/${id}/edit`);
      await getDeleteButton(page).click();

      // Assert
      await expect(page.getByRole("dialog").getByRole("button", { name: "지우는 중…" })).toBeDisabled();
      expect(request.getRequests()).toBe(1);
    } finally {
      request.release();
      await deleteTodo();
    }
  });
});

test.describe("커플 사진 메뉴", () => {
  test("사진 지우기를 누르면 확인 단계로 바뀌고, 취소한 뒤 다시 열면 처음 메뉴가 나온다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/", page.getByRole("button", { name: "커플 사진 바꾸기" }));

    // Act
    await page.getByRole("button", { name: "커플 사진 바꾸기" }).click();
    await expect(page.getByRole("dialog", { name: "커플 사진", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "사진 지우기" }).click();

    // Assert: 누른 버튼이 사라지므로 초점이 확인 단계의 취소로 옮겨 간다
    const confirm = page.getByRole("dialog", { name: "커플 사진을 지울까요?" });
    await expect(confirm).toHaveAccessibleDescription(/되돌릴 수 없어요/);
    const cancel = confirm.getByRole("button", { name: "취소" });
    await expect(cancel).toBeFocused();

    // Act
    await cancel.click();
    await expect(confirm).toBeHidden();
    await page.getByRole("button", { name: "커플 사진 바꾸기" }).click();

    // Assert
    const menu = page.getByRole("dialog", { name: "커플 사진", exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "사진 바꾸기" })).toBeVisible();
  });

  test("메뉴를 연 채 뒤로 가도 앱이 막히지 않는다", async ({ page }) => {
    // Arrange: 기록 목록에서 홈으로 옮겨 와야 뒤로 갈 곳이 생긴다
    await openScreen(page, "/records", getTab(page, CALENDAR_PATH));
    await getTab(page, "/").click();
    await page.getByRole("button", { name: "커플 사진 바꾸기" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Act
    await page.goBack();
    await page.waitForURL(/\/records/);

    // Assert
    await expectTabsToWork(page);
  });
});

test.describe("다시 로그인 창", () => {
  test("로그인을 확인하는 중에는 Esc를 눌러도 닫히지 않고, 끝난 뒤에는 닫힌다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/todos/new", getSaveButton(page));
    await page.getByRole("textbox").fill("E2E 저장하지 않는 창 확인");
    await page.context().clearCookies();
    await getSaveButton(page).click();
    await expect(getSessionDialog(page)).toBeVisible();
    let releaseRequest = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/auth/v1/token*", async (route) => {
      await held;
      return route.abort();
    });

    try {
      // Act
      await getSessionDialog(page).getByLabel("이메일").fill("nobody@example.com");
      await getSessionDialog(page).getByLabel("비밀번호").fill("wrong-password");
      await getSessionDialog(page).getByRole("button", { name: "로그인" }).click();
      await expect(getSessionDialog(page).getByRole("button", { name: "확인 중…" })).toBeDisabled();
      await page.keyboard.press("Escape");

      // Assert: 닫혔다면 아래 실패 문구를 볼 수 없다
      await expect(getSessionDialog(page)).toBeVisible();
      releaseRequest();
      await expect(getSessionDialog(page).getByRole("alert")).toBeVisible();

      // Act
      await page.keyboard.press("Escape");

      // Assert
      await expect(getSessionDialog(page)).toBeHidden();
    } finally {
      releaseRequest();
    }
  });
});
