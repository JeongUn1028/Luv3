import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { MODAL_OPEN_GUARD_WAIT_MS } from "./support/constants";
import { createDisposableEvent, createDisposableRecord } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

// 다른 테스트가 쓰지 않는 지난 달. 기기마다 달을 나눠 두 기기가 함께 돌아도 서로의 기록이 후보로 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2019-06" : "2019-05");
const openDay = (page: Page, date: string, ready: Locator): Promise<void> =>
  openScreen(page, `/calendar?month=${date.slice(0, 7)}&date=${date}`, ready);
const getLeaveLink = (page: Page, title: string): Locator =>
  page.getByRole("link", { name: `${title} 기록 남기기`, exact: true }).locator("visible=true");
const getViewLink = (page: Page, title: string): Locator =>
  page.getByRole("link", { name: `${title} 기록 보기`, exact: true }).locator("visible=true");
// 기록 줄의 이름은 "기록 {제목} {작성자}"다
const getRecordRow = (page: Page, title: string): Locator =>
  page.getByRole("link", { name: new RegExp(`^기록 ${title}( |$)`) }).locator("visible=true");
const getDialog = (page: Page): Locator => page.getByRole("dialog").locator("visible=true");

// 고르면 바로 잇는 창은 두 번 누르기를 막으려고 열린 직후 잠깐 누름을 받지 않으므로 그 시간을 기다린다
const openChooser = async (page: Page, trigger: Locator): Promise<void> => {
  await trigger.click();
  await getDialog(page).waitFor();
  await page.waitForTimeout(MODAL_OPEN_GUARD_WAIT_MS);
};

test.describe("이미 쓴 기록을 일정에 잇기", () => {
  test("일정의 기록 남기기에서 그날 쓴 기록을 고르면 캘린더가 일정 줄 하나로 바뀌고 기록 보기가 그 기록을 연다", async ({ page }, testInfo) => {
    // Arrange: 기록 탭에서 바로 쓴 기록이라 일정과 이어지지 않았다
    const date = `${getMonth(testInfo)}-04`;
    const eventId = randomUUID();
    const recordId = randomUUID();
    const title = createTestName("E2E 잇기 일정", testInfo);
    const recordTitle = createTestName("E2E 잇기 기록", testInfo);
    const deleteEvent = await createDisposableEvent({ id: eventId, title, date });
    const deleteRecord = await createDisposableRecord({ id: recordId, title: recordTitle, date });

    try {
      await openDay(page, date, getLeaveLink(page, title));
      await expect(getRecordRow(page, recordTitle)).toBeVisible();

      // Act
      await openChooser(page, getLeaveLink(page, title));
      await expect(getDialog(page)).toContainText("기록을 어떻게 남길까요?");
      await getDialog(page).getByRole("button", { name: `${recordTitle} 기록과 잇기` }).click();

      // Assert
      await expect(getViewLink(page, title)).toHaveAttribute("href", `/dates/${recordId}`);
      await expect(getRecordRow(page, recordTitle)).toHaveCount(0);
      await expect(getDialog(page)).toHaveCount(0);
      await getViewLink(page, title).click();
      await page.waitForURL(`**/dates/${recordId}`);
    } finally {
      await deleteRecord();
      await deleteEvent();
    }
  });

  test("일정 고치기 화면에서 기록을 이어도 고치던 내용은 그대로 두고 버튼이 기록 보기가 된다", async ({ page }, testInfo) => {
    // Arrange
    const date = `${getMonth(testInfo)}-07`;
    const eventId = randomUUID();
    const recordId = randomUUID();
    const title = createTestName("E2E 고치기 잇기 일정", testInfo);
    const recordTitle = createTestName("E2E 고치기 잇기 기록", testInfo);
    const deleteEvent = await createDisposableEvent({ id: eventId, title, date });
    const deleteRecord = await createDisposableRecord({ id: recordId, title: recordTitle, date });
    const titleField = page.locator("#event-title").locator("visible=true");
    const leaveLink = page.getByRole("link", { name: "기록 남기기", exact: true }).locator("visible=true");

    try {
      await openScreen(page, `/events/${eventId}/edit`, leaveLink);
      await titleField.fill(`${title} 고치는 중`);

      // Act
      await openChooser(page, leaveLink);
      await getDialog(page).getByRole("button", { name: `${recordTitle} 기록과 잇기` }).click();

      // Assert
      await expect(page.getByRole("link", { name: "기록 보기", exact: true }).locator("visible=true")).toHaveAttribute("href", `/dates/${recordId}`);
      await expect(titleField).toHaveValue(`${title} 고치는 중`);
    } finally {
      await deleteRecord();
      await deleteEvent();
    }
  });

  test("잇는 동안에는 창 바깥을 눌러도 닫히지 않고, 화면이 바뀐 뒤에 닫힌다", async ({ page }, testInfo) => {
    // Arrange: 느린 연결에서 잇기 응답이 늦게 오는 경우다
    const date = `${getMonth(testInfo)}-25`;
    const recordId = randomUUID();
    const title = createTestName("E2E 잇는 중 일정", testInfo);
    const recordTitle = createTestName("E2E 잇는 중 기록", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date });
    const deleteRecord = await createDisposableRecord({ id: recordId, title: recordTitle, date });
    let releaseLink = (): void => undefined;
    const linkHeld = new Promise<void>((resolve) => {
      releaseLink = resolve;
    });
    await page.route("**/rest/v1/rpc/link_date_record", async (route) => {
      await linkHeld;
      await route.continue();
    });

    try {
      await openDay(page, date, getLeaveLink(page, title));
      await openChooser(page, getLeaveLink(page, title));
      await getDialog(page).getByRole("button", { name: `${recordTitle} 기록과 잇기` }).click();

      // Act
      await page.mouse.click(4, 4);

      // Assert
      await expect(getDialog(page)).toContainText("잇는 중…");
      releaseLink();
      await expect(getViewLink(page, title)).toHaveAttribute("href", `/dates/${recordId}`);
      await expect(getDialog(page)).toHaveCount(0);
    } finally {
      releaseLink();
      await deleteRecord();
      await deleteEvent();
    }
  });

  test("그날 이을 기록이 없으면 기록 남기기가 바로 작성 화면을 연다", async ({ page }, testInfo) => {
    // Arrange: 다른 날의 기록은 후보가 아니다
    const month = getMonth(testInfo);
    const title = createTestName("E2E 잇기 없음", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date: `${month}-11` });
    const deleteRecord = await createDisposableRecord({ id: randomUUID(), title: `${title} 다른 날`, date: `${month}-12` });

    try {
      await openDay(page, `${month}-11`, getLeaveLink(page, title));

      // Act
      await getLeaveLink(page, title).click();

      // Assert
      await page.waitForURL("**/dates/new?**");
      await expect(page.locator("#title").locator("visible=true")).toHaveValue(title);
    } finally {
      await deleteRecord();
      await deleteEvent();
    }
  });

  test("기록 상세에서 일정과 잇고, 연결을 끊으면 기록과 일정은 남고 캘린더에 다시 두 줄로 보인다", async ({ page }, testInfo) => {
    // Arrange
    const date = `${getMonth(testInfo)}-18`;
    const recordId = randomUUID();
    const title = createTestName("E2E 상세 잇기 일정", testInfo);
    const recordTitle = createTestName("E2E 상세 잇기 기록", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date });
    const deleteRecord = await createDisposableRecord({ id: recordId, title: recordTitle, date });
    const linkButton = page.getByRole("button", { name: "일정과 잇기", exact: true }).locator("visible=true");
    const unlinkButton = page.getByRole("button", { name: "연결 끊기", exact: true }).locator("visible=true");

    try {
      await openScreen(page, `/dates/${recordId}`, linkButton);

      // Act: 잇기
      await openChooser(page, linkButton);
      await getDialog(page).getByRole("button", { name: `${title} 일정과 잇기` }).click();

      // Assert
      await expect(unlinkButton).toBeVisible();
      await expect(page.locator("main").getByText(title, { exact: true }).locator("visible=true")).toBeVisible();
      await expect(linkButton).toHaveCount(0);

      // Act: 끊기
      await unlinkButton.click();
      await getDialog(page).getByRole("button", { name: "연결 끊기" }).click();

      // Assert
      await expect(linkButton).toBeVisible();
      await openDay(page, date, getLeaveLink(page, title));
      await expect(getRecordRow(page, recordTitle)).toBeVisible();
    } finally {
      await deleteRecord();
      await deleteEvent();
    }
  });
});
