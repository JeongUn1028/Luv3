import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { getSubmitButton, pickPhoto } from "./support/actions";
import {
  createDisposableEvent,
  createDisposableRecord,
  createDisposableRepeatingEvent,
  deleteRecordWithFiles,
  getRecordIdsByTitle,
  renameRecord,
} from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

// 다른 테스트의 일정·홈 최근 기록과 겹치지 않는 지난 날
const PAST_DATE = "2020-04-10";
const PAST_CALENDAR = `/calendar?month=2020-04&date=${PAST_DATE}`;

const getLeaveLink = (page: Page, title: string): Locator => page.getByRole("link", { name: `${title} 기록 남기기` }).locator("visible=true");
const getViewLink = (page: Page, title: string): Locator => page.getByRole("link", { name: `${title} 기록 보기` }).locator("visible=true");
const getFormAlert = (page: Page): Locator => page.locator("main").getByRole("alert").locator("visible=true");

test.describe("일정과 기록 연결", () => {
  test("지난 일정에서 기록을 남기면 메모까지 채우고, 저장한 뒤 기록 제목을 바꿔도 일정에서 그 기록을 연다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 연결 남기기", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, date: PAST_DATE, memo: "도슨트 2시" });

    try {
      await openScreen(page, PAST_CALENDAR, getLeaveLink(page, title));
      await getLeaveLink(page, title).click();
      await expect(page.locator("#title").locator("visible=true")).toHaveValue(title);
      await expect(page.locator("#memo").locator("visible=true")).toHaveValue("도슨트 2시");
      await pickPhoto(page, 1);

      // Act
      await getSubmitButton(page).click();
      await page.waitForURL("**/records");
      const [recordId] = await getRecordIdsByTitle(title);
      await renameRecord(recordId, `${title} 바꿈`);

      // Assert
      await openScreen(page, PAST_CALENDAR, getViewLink(page, title));
      await expect(getLeaveLink(page, title)).toHaveCount(0);
      await getViewLink(page, title).click();
      await page.waitForURL(`**/dates/${recordId}`);
    } finally {
      for (const id of [...(await getRecordIdsByTitle(title)), ...(await getRecordIdsByTitle(`${title} 바꿈`))]) await deleteRecordWithFiles(id);
      await deleteEvent();
    }
  });

  test("이미 기록을 남긴 일정의 작성 화면에서 저장하면 새로 만들지 않고 남긴 기록으로 안내한다", async ({ page }, testInfo) => {
    // Arrange: 앞서 연 캘린더에서 "기록 남기기"를 누른 경우다
    const eventId = randomUUID();
    const recordId = randomUUID();
    const title = createTestName("E2E 연결 중복", testInfo);
    const deleteEvent = await createDisposableEvent({ id: eventId, title, date: PAST_DATE });
    const deleteRecord = await createDisposableRecord({ id: recordId, title, eventLink: { eventId, eventDate: PAST_DATE } });

    try {
      await openScreen(page, `/dates/new?event=${eventId}&eventDate=${PAST_DATE}`, page.locator("#memo").locator("visible=true"));
      await pickPhoto(page, 1);

      // Act
      await getSubmitButton(page).click();

      // Assert
      await expect(getFormAlert(page)).toContainText("이 일정에는 이미 남긴 기록이 있어요");
      expect(await getRecordIdsByTitle(title)).toEqual([recordId]);
      await page.getByRole("link", { name: "남긴 기록 보기" }).click();
      await page.waitForURL(`**/dates/${recordId}`);
    } finally {
      await deleteRecord();
      await deleteEvent();
    }
  });

  test("일정 고치기 화면과 기록 상세에서 서로 오간다", async ({ page }, testInfo) => {
    // Arrange
    const eventId = randomUUID();
    const recordId = randomUUID();
    const title = createTestName("E2E 연결 오가기", testInfo);
    const deleteEvent = await createDisposableEvent({ id: eventId, title, date: PAST_DATE });
    const deleteRecord = await createDisposableRecord({ id: recordId, title, eventLink: { eventId, eventDate: PAST_DATE } });

    try {
      await openScreen(page, `/events/${eventId}/edit`, page.getByRole("link", { name: "기록 보기", exact: true }));

      // Act & Assert
      await page.getByRole("link", { name: "기록 보기", exact: true }).click();
      await page.waitForURL(`**/dates/${recordId}`);
      await page.getByRole("link", { name: "일정 보기" }).locator("visible=true").click();
      await page.waitForURL(`**/events/${eventId}/edit`);
    } finally {
      await deleteRecord();
      await deleteEvent();
    }
  });

  test("반복 일정은 기록을 남긴 날만 기록 보기가 되고 다른 날은 따로 남긴다", async ({ page }, testInfo) => {
    // Arrange
    const eventId = randomUUID();
    const title = createTestName("E2E 연결 반복", testInfo);
    const deleteEvent = await createDisposableRepeatingEvent({ id: eventId, title, date: "2020-04-01", repeatRule: "weekly", repeatUntil: "2020-04-30" });
    const deleteRecord = await createDisposableRecord({ id: randomUUID(), title, eventLink: { eventId, eventDate: "2020-04-08" } });

    try {
      // Act & Assert
      await openScreen(page, "/calendar?month=2020-04&date=2020-04-08", getViewLink(page, title));
      await openScreen(page, "/calendar?month=2020-04&date=2020-04-15", getLeaveLink(page, title));
      await expect(getLeaveLink(page, title)).toHaveAttribute("href", `/dates/new?event=${eventId}&eventDate=2020-04-15`);
    } finally {
      await deleteRecord();
      await deleteEvent();
    }
  });
});
