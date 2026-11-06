import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { toKstDate } from "../src/lib/anniversary";
import { createDisposableRepeatingEvent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const DAY_MS = 24 * 60 * 60 * 1000;

/** 날짜 버튼의 이름에 일정 수가 들어간다. 다른 기기 크기의 테스트가 같은 날에 일정을 만들 수 있어 수는 보지 않는다 */
const getDayWithEvent = (page: Page, day: string) => page.getByRole("button", { name: new RegExp(`^${day} .*함께 일정 \\d+개`) });
const getDay = (page: Page, day: string) => page.getByRole("button", { name: new RegExp(`^${day} `) });

test.describe("반복 일정", () => {
  test("매주 일정은 달력의 해당 요일에 나오고 건너뛴 날과 끝난 뒤에는 나오지 않는다", async ({ page }) => {
    // Arrange: 달력을 여는 달보다 앞에 시작한 반복이다. 2031년 1월 8일과 3월 12일은 수요일이다
    const deleteEvent = await createDisposableRepeatingEvent({
      id: randomUUID(),
      title: "E2E 매주 일정",
      date: "2031-01-08",
      repeatRule: "weekly",
      repeatUntil: "2031-03-12",
      exceptionDates: ["2031-03-05"],
    });

    try {
      // Act
      await openScreen(page, "/calendar?month=2031-03", getDay(page, "3월 12일"));

      // Assert
      await expect(getDayWithEvent(page, "2월 26일")).toBeVisible();
      await expect(getDayWithEvent(page, "3월 12일")).toBeVisible();
      await expect(getDayWithEvent(page, "3월 5일")).toHaveCount(0);
      await expect(getDayWithEvent(page, "3월 19일")).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });

  test("끝나는 날이 지난 달을 열면 반복 일정이 나오지 않는다", async ({ page }) => {
    // Arrange
    const deleteEvent = await createDisposableRepeatingEvent({
      id: randomUUID(),
      title: "E2E 끝난 일정",
      date: "2032-01-07",
      repeatRule: "weekly",
      repeatUntil: "2032-01-14",
    });

    try {
      // Act
      await openScreen(page, "/calendar?month=2032-03", getDay(page, "3월 3일"));

      // Assert
      await expect(page.getByRole("button", { name: /함께 일정 \d+개/ })).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });

  test("매달 31일 일정은 2월에 마지막 날로 옮겨 나온다", async ({ page }) => {
    // Arrange
    const deleteEvent = await createDisposableRepeatingEvent({
      id: randomUUID(),
      title: "E2E 매달 일정",
      date: "2033-01-31",
      repeatRule: "monthly",
    });

    try {
      // Act
      await openScreen(page, "/calendar?month=2033-02", getDay(page, "2월 28일"));

      // Assert
      await expect(getDayWithEvent(page, "2월 28일")).toBeVisible();
    } finally {
      await deleteEvent();
    }
  });

  test("고른 날의 일정 줄은 반복 규칙을 보여 주고 그날을 담아 고치기로 간다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const title = `E2E 줄 일정 ${id}`;
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2034-01-04", repeatRule: "weekly" });

    try {
      // Act
      await openScreen(page, "/calendar?month=2034-03&date=2034-03-08", page.getByText(title));
      const row = page.getByRole("link", { name: new RegExp(title) });

      // Assert
      await expect(row).toContainText("매주");
      await expect(row).toHaveAttribute("href", `/events/${id}/edit?date=2034-03-08`);
    } finally {
      await deleteEvent();
    }
  });

  test("오늘 오는 반복 일정은 앞서 시작했어도 홈 일정 칸의 수에 들어간다", async ({ page }) => {
    // Arrange: 오늘의 공통 일정 2개가 칸을 채우므로 수로 확인한다. 앞세우면 함께 도는 다른 테스트의 일정을 밀어내고,
    // 끝나는 날이 없으면 다른 테스트가 보는 먼 달까지 펼쳐져서 오늘 끝나게 둔다
    const now = Date.now();
    const deleteEvent = await createDisposableRepeatingEvent({
      id: randomUUID(),
      title: "E2E 홈 반복",
      date: toKstDate(new Date(now - 7 * DAY_MS)),
      repeatRule: "weekly",
      repeatUntil: toKstDate(new Date(now)),
    });

    try {
      // Act & Assert
      await openScreen(page, "/", page.getByText(/^외 \d+개$/));
    } finally {
      await deleteEvent();
    }
  });
});
