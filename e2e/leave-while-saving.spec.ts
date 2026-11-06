import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Locator, Page, Route } from "@playwright/test";
import { toKstDate } from "@/lib/anniversary";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { PHOTO_FIXTURE_PATH } from "./support/constants";
import { pickDate } from "./support/date-picker";
import { createDisposableEvent, createDisposableRecord, createDisposableTodo, deleteEventsByTitle, deleteRecordWithFiles, deleteTodosByContent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const CREATE_RECORD_URL = "**/rest/v1/rpc/create_date_record";
const UPDATE_RECORD_URL = "**/rest/v1/rpc/update_date_record";
const EVENTS_URL = "**/rest/v1/events*";
const TODOS_URL = "**/rest/v1/todos*";

const getSaveButton = (page: Page): Locator => page.locator('main button[type="submit"]').locator("visible=true");
const getTab = (page: Page, href: string): Locator => page.locator(`nav a[href="${href}"]`).locator("visible=true");
const getNotice = (page: Page, role: "status" | "alert", name: string): Locator =>
  page.getByRole(role).filter({ hasText: name }).filter({ has: page.getByRole("button", { name: "닫기" }) });

/** 저장 요청을 붙들어, 사용자가 다른 화면으로 옮긴 뒤에 끝나게 한다 */
const holdSaveRequest = async (page: Page, url: string, finish: (route: Route) => Promise<void> = (route) => route.continue()) => {
  let releaseRequest = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    releaseRequest = resolve;
  });
  let requestBody = "";
  let markRequested = (): void => undefined;
  const requested = new Promise<void>((resolve) => {
    markRequested = resolve;
  });
  await page.route(url, async (route) => {
    if (route.request().method() === "GET") return route.continue();
    requestBody = route.request().postData() ?? "";
    markRequested();
    await released;
    return finish(route);
  });
  return { requested, release: releaseRequest, getRequestBody: () => requestBody };
};

const failRequest = (route: Route) => route.fulfill({ status: 500, json: { message: "E2E 저장 실패" } });

const getYesterday = (): string => toKstDate(new Date(Date.now() - 24 * 60 * 60 * 1000));

const fillNewRecord = async (page: Page, title: string): Promise<void> => {
  await openScreen(page, "/dates/new", page.locator("#memo").locator("visible=true"));
  await page.getByLabel("사진 고르기").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO_FIXTURE_PATH) });
  await page.getByRole("button", { name: "1번째 사진 빼기" }).waitFor();
  // 오늘 날짜면 나란히 도는 홈 테스트의 "최근 기록" 자리를 잠깐 차지하므로 어제로 둔다
  await pickDate(page, "#date", getYesterday());
  await page.locator("#title").fill(title);
};

const leaveRecordFormToTodos = async (page: Page): Promise<void> => {
  await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
  await page.waitForURL(`**${RECORDS_PATH}`);
  await getTab(page, TODOS_PATH).tap();
  await page.waitForURL(`**${TODOS_PATH}`);
};

const getRecordId = (requestBody: string): string => {
  const { p_id: id } = JSON.parse(requestBody) as { p_id: string };
  return id;
};

test.describe("저장하는 사이 다른 화면으로 옮기면", () => {
  test("기록 저장이 끝나도 보던 화면에 남고, 저장했다고 알리며, 알림에서 새 기록을 볼 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const title = `E2E 나가도 저장 ${testInfo.project.name}`;
    await fillNewRecord(page, title);
    const save = await holdSaveRequest(page, CREATE_RECORD_URL);
    await getSaveButton(page).tap();
    await save.requested;
    try {
      // Act
      await leaveRecordFormToTodos(page);
      save.release();

      // Assert
      await expect(getNotice(page, "status", "기록을 저장했어요")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(TODOS_PATH);

      await getNotice(page, "status", "기록을 저장했어요").getByRole("link", { name: "보기" }).tap();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: title })).toBeVisible();
      await expect(getNotice(page, "status", "기록을 저장했어요")).toHaveCount(0);

      // 저장 뒤 숨겨진 폼은 빈 폼으로 되돌아가 같은 기록을 또 저장하지 않게 한다
      await page.goto("/dates/new");
      await expect(page.locator("#title").locator("visible=true")).toHaveValue("");
    } finally {
      await deleteRecordWithFiles(getRecordId(save.getRequestBody()));
    }
  });

  test("기록 저장이 끝난 뒤 브라우저 뒤로 가기로 숨겨 둔 목록에 돌아가도 새 기록이 보인다", async ({ page }, testInfo) => {
    // Arrange
    const title = `E2E 뒤로 가기 ${testInfo.project.name}`;
    await fillNewRecord(page, title);
    const save = await holdSaveRequest(page, CREATE_RECORD_URL);
    await getSaveButton(page).tap();
    await save.requested;
    try {
      await leaveRecordFormToTodos(page);
      save.release();
      await expect(getNotice(page, "status", "기록을 저장했어요")).toBeVisible();

      // Act: iOS 가장자리 밀기와 같은 이동이다
      await page.goBack();
      await page.waitForURL(`**${RECORDS_PATH}`);

      // Assert
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: title })).toBeVisible();
    } finally {
      await deleteRecordWithFiles(getRecordId(save.getRequestBody()));
    }
  });

  test("기록 저장에 실패하면 닫을 때까지 알리고, 돌아가면 쓴 내용과 사진이 남아 있으며 다시 저장할 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const title = `E2E 나가서 실패 ${testInfo.project.name}`;
    await fillNewRecord(page, title);
    await page.locator("#memo").fill("지워지면 안 되는 글");
    const save = await holdSaveRequest(page, CREATE_RECORD_URL, failRequest);
    await getSaveButton(page).tap();
    await save.requested;

    // Act
    await leaveRecordFormToTodos(page);
    save.release();

    // Assert: 알림이 저절로 사라지지 않는다
    const notice = getNotice(page, "alert", "기록을 저장하지 못했어요");
    await expect(notice).toBeVisible();
    await page.waitForTimeout(5_000);
    await expect(notice).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(TODOS_PATH);

    await notice.getByRole("link", { name: "돌아가기" }).tap();
    await page.waitForURL("**/dates/new");
    await expect(notice).toHaveCount(0);
    await expect(page.locator("#title").locator("visible=true")).toHaveValue(title);
    await expect(page.locator("#memo").locator("visible=true")).toHaveValue("지워지면 안 되는 글");
    await expect(page.getByRole("button", { name: "1번째 사진 빼기" })).toBeVisible();
    // 코드 없는 500이라 서버가 처리했는지 알 수 없는 실패다
    await expect(page.locator("main").getByRole("alert").locator("visible=true")).toContainText("저장됐는지 확인하지 못했어요");

    // Act: 다시 저장한다
    await page.unrouteAll({ behavior: "wait" });
    const retry = await holdSaveRequest(page, CREATE_RECORD_URL);
    await getSaveButton(page).tap();
    await retry.requested;
    retry.release();
    try {
      // Assert: 그 자리에 있었으니 평소처럼 목록으로 간다
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: title })).toBeVisible();
    } finally {
      await deleteRecordWithFiles(getRecordId(retry.getRequestBody()));
    }
  });

  test("여러 화면을 다녀와 폼이 사라져도 저장에 실패한 내용과 사진은 돌아가면 남아 있다", async ({ page }, testInfo) => {
    const title = `E2E 멀리 나가서 실패 ${testInfo.project.name}`;
    await fillNewRecord(page, title);
    const save = await holdSaveRequest(page, CREATE_RECORD_URL, failRequest);
    await getSaveButton(page).tap();
    await save.requested;

    // Act: 숨겨 두는 화면 수(3개)를 넘겨 폼을 밀어낸다
    await leaveRecordFormToTodos(page);
    await getTab(page, CALENDAR_PATH).tap();
    await page.waitForURL(`**${CALENDAR_PATH}*`);
    await getTab(page, "/").tap();
    await page.waitForURL((url) => url.pathname === "/");
    save.release();
    const notice = getNotice(page, "alert", "기록을 저장하지 못했어요");
    await expect(notice).toBeVisible();
    await notice.getByRole("link", { name: "돌아가기" }).tap();
    await page.waitForURL("**/dates/new");

    // Assert
    await expect(page.locator("#title").locator("visible=true")).toHaveValue(title);
    const preview = page.locator("main").locator("visible=true").getByRole("img", { name: "1번째 사진" });
    await expect(preview).toBeVisible();
    await expect.poll(() => preview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  });

  test("기록 고치기에 실패해도 돌아가면 고친 글이 남아 있다", async ({ page }, testInfo) => {
    // Arrange: 고치기 화면은 열 때마다 새로 만들어지므로, 그냥 돌아가면 고친 내용이 사라진다
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: `E2E 고치다 실패 ${testInfo.project.name}` });
    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo").locator("visible=true"));
      await page.locator("#memo").fill("고친 글");
      const save = await holdSaveRequest(page, UPDATE_RECORD_URL, failRequest);
      await getSaveButton(page).tap();
      await save.requested;

      // Act
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**/dates/${id}`);
      save.release();
      const notice = getNotice(page, "alert", "기록을 저장하지 못했어요");
      await notice.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/dates/${id}/edit`);

      // Assert
      await expect(page.locator("#memo").locator("visible=true")).toHaveValue("고친 글");
    } finally {
      await deleteRecord();
    }
  });

  test("저장 중에 나갔다가 폼으로 돌아와 있으면 평소처럼 목록으로 가고 알림은 띄우지 않는다", async ({ page }, testInfo) => {
    const title = `E2E 돌아와서 저장 ${testInfo.project.name}`;
    await fillNewRecord(page, title);
    const save = await holdSaveRequest(page, CREATE_RECORD_URL);
    await getSaveButton(page).tap();
    await save.requested;
    try {
      // Act
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await page.goBack();
      await page.waitForURL("**/dates/new");
      await expect(page.locator("#title").locator("visible=true")).toHaveValue(title);
      save.release();

      // Assert
      await page.waitForURL(`**${RECORDS_PATH}`);
      await expect(page.locator("main").locator("visible=true").getByRole("link", { name: title })).toBeVisible();
      await expect(getNotice(page, "status", "기록을 저장했어요")).toHaveCount(0);
    } finally {
      await deleteRecordWithFiles(getRecordId(save.getRequestBody()));
    }
  });

  test("하고 싶은 것 저장이 끝나도 다른 폼에 쓰던 내용을 지우지 않고, 나중에 목록을 열면 보인다", async ({ page }, testInfo) => {
    // Arrange
    const content = `E2E 나가도 저장 ${testInfo.project.name}`;
    await openScreen(page, "/todos/new", page.locator("#todo-content"));
    await page.locator("#todo-content").fill(content);
    const save = await holdSaveRequest(page, TODOS_URL);
    await getSaveButton(page).tap();
    await save.requested;
    try {
      // Act: 다른 폼으로 옮겨 쓰는 중에 저장이 끝난다
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      await getTab(page, CALENDAR_PATH).tap();
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      await page.locator(`main a[href^="/events/new"]`).locator("visible=true").first().tap();
      await page.waitForURL("**/events/new*");
      await page.locator("#event-title").locator("visible=true").fill("쓰던 일정");
      save.release();

      // Assert
      await expect(getNotice(page, "status", "하고 싶은 것을 저장했어요")).toBeVisible();
      // 다시 불러오면 폼이 새로 만들어져 비는 것을 잡으려면, 그 응답이 올 만큼 기다려야 한다
      await page.waitForTimeout(2_000);
      expect(new URL(page.url()).pathname).toBe("/events/new");
      await expect(page.locator("#event-title").locator("visible=true")).toHaveValue("쓰던 일정");

      await getNotice(page, "status", "하고 싶은 것을 저장했어요").getByRole("link", { name: "보기" }).tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      await expect(page.locator("main").locator("visible=true").getByText(content)).toBeVisible();
    } finally {
      await deleteTodosByContent(content);
    }
  });

  test("하고 싶은 것을 고치다 실패해도 돌아가면 고친 내용이 남아 있다", async ({ page }, testInfo) => {
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: `E2E 고칠 항목 ${testInfo.project.name}` });
    try {
      await openScreen(page, `/todos/${id}/edit`, page.locator("#todo-content"));
      await page.locator("#todo-content").fill("고친 항목");
      const save = await holdSaveRequest(page, TODOS_URL, failRequest);
      await getSaveButton(page).tap();
      await save.requested;

      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      save.release();
      const notice = getNotice(page, "alert", "하고 싶은 것을 저장하지 못했어요");
      await notice.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/todos/${id}/edit`);

      await expect(page.locator("#todo-content").locator("visible=true")).toHaveValue("고친 항목");
      await expect(page.locator("main").getByRole("alert").locator("visible=true")).toContainText("저장하지 못했어요");
    } finally {
      await deleteTodo();
    }
  });

  test("고치기를 저장한 뒤 숨겨 둔 폼으로 돌아오면 저장한 값이 보인다", async ({ page }, testInfo) => {
    // Arrange: 예전 값이 남아 있으면 다시 저장할 때 방금 고친 내용을 덮어쓴다
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: `E2E 고쳐 저장 ${testInfo.project.name}` });
    try {
      await openScreen(page, `/todos/${id}/edit`, page.locator("#todo-content"));
      await page.locator("#todo-content").fill("고쳐서 저장한 항목");
      const save = await holdSaveRequest(page, TODOS_URL);
      await getSaveButton(page).tap();
      await save.requested;
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      save.release();
      await expect(getNotice(page, "status", "하고 싶은 것을 저장했어요")).toBeVisible();

      // Act
      await page.goBack();
      await page.waitForURL(`**/todos/${id}/edit`);

      // Assert
      await expect(page.locator("#todo-content").locator("visible=true")).toHaveValue("고쳐서 저장한 항목");
    } finally {
      await deleteTodo();
    }
  });

  test("다른 폼을 쓰는 중에 저장이 끝나도 뒤로 가기로 돌아간 목록에 새 항목이 보인다", async ({ page }, testInfo) => {
    // Arrange
    const content = `E2E 폼에서 뒤로 ${testInfo.project.name}`;
    await openScreen(page, "/todos/new", page.locator("#todo-content"));
    await page.locator("#todo-content").fill(content);
    const save = await holdSaveRequest(page, TODOS_URL);
    await getSaveButton(page).tap();
    await save.requested;
    try {
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      await page.waitForLoadState("networkidle");
      await getTab(page, CALENDAR_PATH).tap();
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      await page.locator(`main a[href^="/events/new"]`).locator("visible=true").first().tap();
      await page.waitForURL("**/events/new*");
      save.release();
      await expect(getNotice(page, "status", "하고 싶은 것을 저장했어요")).toBeVisible();

      // Act
      await page.goBack();
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      await page.goBack();
      await page.waitForURL(`**${TODOS_PATH}`);

      // Assert
      await expect(page.locator("main").locator("visible=true").getByText(content)).toBeVisible();
    } finally {
      await deleteTodosByContent(content);
    }
  });

  test("실패 알림은 다른 길로 폼에 돌아와도 사라지고, 실패한 내용은 한 번만 채운다", async ({ page }, testInfo) => {
    // Arrange
    const content = `E2E 한 번만 ${testInfo.project.name}`;
    await openScreen(page, "/todos/new", page.locator("#todo-content"));
    await page.locator("#todo-content").fill(content);
    const save = await holdSaveRequest(page, TODOS_URL, failRequest);
    await getSaveButton(page).tap();
    await save.requested;
    await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
    await page.waitForURL(`**${TODOS_PATH}`);
    save.release();
    const notice = getNotice(page, "alert", "하고 싶은 것을 저장하지 못했어요");
    await expect(notice).toBeVisible();

    // Act: 알림을 누르지 않고 뒤로 가기로 돌아간다
    await page.goBack();
    await page.waitForURL("**/todos/new");

    // Assert
    await expect(page.locator("#todo-content").locator("visible=true")).toHaveValue(content);
    await expect(notice).toHaveCount(0);

    // Act: 쓰지 않기로 하고 나갔다가 새로 연다
    await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
    await page.waitForURL(`**${TODOS_PATH}`);
    await page.locator('main a[href="/todos/new"]').locator("visible=true").first().tap();
    await page.waitForURL("**/todos/new");

    // Assert
    await expect(page.locator("#todo-content").locator("visible=true")).toHaveValue("");
  });

  test("고치는 항목이 이미 지워져 실패하면 쓴 내용이 남아 있다고 안내하지 않는다", async ({ page }, testInfo) => {
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: `E2E 지워질 항목 ${testInfo.project.name}` });
    try {
      await openScreen(page, `/todos/${id}/edit`, page.locator("#todo-content"));
      await page.locator("#todo-content").fill("고친 항목");
      const save = await holdSaveRequest(page, TODOS_URL);
      await getSaveButton(page).tap();
      await save.requested;
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${TODOS_PATH}`);

      // Act: 저장이 끝나기 전에 상대가 지운다
      await deleteTodo();
      save.release();

      // Assert
      const notice = getNotice(page, "alert", "이미 지워졌어요");
      await expect(notice).toBeVisible();
      await expect(notice).not.toContainText("그대로 있어요");
    } finally {
      await deleteTodo();
    }
  });

  test("일정 저장이 끝나도 보던 화면에 남고, 알림에서 일정을 볼 수 있다", async ({ page }, testInfo) => {
    const title = `E2E 나가도 일정 ${testInfo.project.name}`;
    await openScreen(page, "/events/new", page.locator("#event-memo"));
    await page.locator("#event-title").fill(title);
    const save = await holdSaveRequest(page, EVENTS_URL);
    await getSaveButton(page).tap();
    await save.requested;
    try {
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      await getTab(page, TODOS_PATH).tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      save.release();

      await expect(getNotice(page, "status", "일정을 저장했어요")).toBeVisible();
      expect(new URL(page.url()).pathname).toBe(TODOS_PATH);
      await getNotice(page, "status", "일정을 저장했어요").getByRole("link", { name: "보기" }).tap();
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      await expect(page.locator("main").locator("visible=true").getByText(title)).toBeVisible();
    } finally {
      await deleteEventsByTitle(title);
    }
  });

  test("일정을 고치다 실패해도 돌아가면 고친 내용이 남아 있다", async ({ page }, testInfo) => {
    const id = randomUUID();
    const deleteEvent = await createDisposableEvent({ id, title: `E2E 고칠 일정 ${testInfo.project.name}` });
    try {
      await openScreen(page, `/events/${id}/edit`, page.locator("#event-memo"));
      await page.locator("#event-title").fill("고친 일정");
      const save = await holdSaveRequest(page, EVENTS_URL, failRequest);
      await getSaveButton(page).tap();
      await save.requested;

      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${CALENDAR_PATH}*`);
      save.release();
      const notice = getNotice(page, "alert", "일정을 저장하지 못했어요");
      await notice.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/events/${id}/edit`);

      await expect(page.locator("#event-title").locator("visible=true")).toHaveValue("고친 일정");
    } finally {
      await deleteEvent();
    }
  });
});
