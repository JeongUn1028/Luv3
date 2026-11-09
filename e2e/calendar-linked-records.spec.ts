import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import {
  createDisposableEvent,
  createDisposablePeriodEvent,
  createDisposableRecord,
  createDisposableRepeatingEvent,
  skipEventDate,
} from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 다른 테스트가 쓰지 않는 지난 달. 기기마다 달을 나눠 두 기기가 함께 돌아도(main 머지 때) 날짜 칸의 기록 수가 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2020-06" : "2020-05");
const openDay = (page: Page, date: string, ready: Locator): Promise<void> =>
  openScreen(page, `/calendar?month=${date.slice(0, 7)}&date=${date}`, ready);
const getViewLink = (page: Page, title: string): Locator =>
  page.getByRole("link", { name: `${title} 기록 보기`, exact: true }).locator("visible=true");
const getSelectedDay = (page: Page): Locator => page.locator('button[aria-pressed="true"]').locator("visible=true");
// 기록 줄의 이름은 "기록 {제목} {작성자}"다. 제목이 서로의 앞부분이라 시작과 제목 끝을 맞춘다
const getRecordRow = (page: Page, title: string): Locator =>
  page.getByRole("link", { name: new RegExp(`^기록 ${title}( |$)`) }).locator("visible=true");

test.describe("캘린더에서 일정과 이어진 기록", () => {
  test("일정과 이어진 기록은 기록 줄과 점 없이 일정 줄의 기록 보기로만 보이고, 직접 쓴 기록은 그대로 보인다", async ({ page }, testInfo) => {
    // Arrange
    const date = `${getMonth(testInfo)}-04`;
    const eventId = randomUUID();
    const title = `E2E 합치기 하루 ${testInfo.project.name}`;
    const linkedTitle = `${title} 남긴 글`;
    const writtenTitle = `${title} 직접 쓴 글`;
    const deleteEvent = await createDisposableEvent({ id: eventId, title, date });
    const deleteLinked = await createDisposableRecord({ id: randomUUID(), title: linkedTitle, date, eventLink: { eventId, eventDate: date } });
    const deleteWritten = await createDisposableRecord({ id: randomUUID(), title: writtenTitle, date });

    try {
      // Act
      await openDay(page, date, getViewLink(page, title));

      // Assert
      await expect(getRecordRow(page, linkedTitle)).toHaveCount(0);
      await expect(getRecordRow(page, writtenTitle)).toBeVisible();
      await expect(getSelectedDay(page)).toHaveAttribute("aria-label", /기록 1개/);
    } finally {
      await deleteWritten();
      await deleteLinked();
      await deleteEvent();
    }
  });

  test("기간 일정과 이어진 여러 날짜 기록은 겹치는 모든 날에서 합쳐진다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    const eventId = randomUUID();
    const title = `E2E 합치기 기간 ${testInfo.project.name}`;
    const linkedTitle = `${title} 남긴 글`;
    const deleteEvent = await createDisposablePeriodEvent({ id: eventId, title, date: `${month}-10`, endDate: `${month}-12` });
    const linkedId = randomUUID();
    const deleteLinked = await createDisposableRecord({
      id: linkedId,
      title: linkedTitle,
      date: `${month}-10`,
      endDate: `${month}-12`,
      eventLink: { eventId, eventDate: `${month}-10` },
    });

    try {
      for (const day of ["10", "11", "12"]) {
        // Act
        await openDay(page, `${month}-${day}`, getViewLink(page, title));

        // Assert: 그날에도 기록이 있고, 따로 줄을 만들지 않고 일정 줄의 버튼이 그 기록을 연다
        await expect(getViewLink(page, title)).toHaveAttribute("href", `/dates/${linkedId}`);
        await expect(getRecordRow(page, linkedTitle)).toHaveCount(0);
        await expect(getSelectedDay(page)).not.toHaveAttribute("aria-label", /기록 \d+개/);
      }
    } finally {
      await deleteLinked();
      await deleteEvent();
    }
  });

  test("이어진 반복 일정의 그날을 건너뛰면 기록은 따로 보인다", async ({ page }, testInfo) => {
    // Arrange: 상대가 그날 일정만 지운 경우다
    const month = getMonth(testInfo);
    const eventId = randomUUID();
    const title = `E2E 합치기 반복 ${testInfo.project.name}`;
    const linkedTitle = `${title} 남긴 글`;
    const deleteEvent = await createDisposableRepeatingEvent({ id: eventId, title, date: `${month}-17`, repeatRule: "weekly", repeatUntil: `${month}-30` });
    const deleteLinked = await createDisposableRecord({ id: randomUUID(), title: linkedTitle, date: `${month}-24`, eventLink: { eventId, eventDate: `${month}-24` } });

    try {
      await openDay(page, `${month}-24`, getViewLink(page, title));
      await expect(getRecordRow(page, linkedTitle)).toHaveCount(0);

      // Act
      await skipEventDate(eventId, `${month}-24`);

      // Assert
      await openDay(page, `${month}-24`, getRecordRow(page, linkedTitle));
      await expect(getViewLink(page, title)).toHaveCount(0);
      await expect(getSelectedDay(page)).toHaveAttribute("aria-label", /기록 1개/);
    } finally {
      await deleteLinked();
      await deleteEvent();
    }
  });
});
