import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { toKstDate } from "../src/lib/anniversary";
import { pickDate } from "./support/date-picker";
import { createDisposablePeriodEvent, deleteEventsByTitle } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const DAY_MS = 24 * 60 * 60 * 1000;

const getRow = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(`^(?!.*기록 남기기).*${title}`) });
const getDayWithEvent = (page: Page, day: string) => page.getByRole("button", { name: new RegExp(`^${day} .*함께 일정 \\d+개`) });

test.describe("기간 일정", () => {
  /** 두 기기가 같은 DB를 나란히 쓰므로 제목에 기기 이름을 붙인다 */
  const createTitle = (label: string, projectName: string): string => `E2E ${label} ${projectName}`;

  test("달을 넘는 기간을 저장하면 모든 날에 나오고 고치고 지울 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTitle("기간 흐름", testInfo.project.name);
    await openScreen(page, "/events/new?date=2036-04-29", page.locator("#event-title"));

    try {
      // Act: 추가
      await page.locator("#event-title").fill(title);
      await page.getByRole("checkbox", { name: "기간" }).check();
      await pickDate(page, "#event-end-date", "2036-05-02");
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert: 시작한 달에서 기간 표시와 형광펜
      await expect(getRow(page, title)).toContainText("04.29–05.02");
      await expect(getDayWithEvent(page, "4월 29일")).toBeVisible();
      await expect(getDayWithEvent(page, "4월 30일")).toBeVisible();

      // Assert: 끝나는 달에서 어느 날을 눌러도 목록에 나오고, 끝난 뒤에는 나오지 않는다
      await openScreen(page, "/calendar?month=2036-05&date=2036-05-02", getRow(page, title));
      await expect(getDayWithEvent(page, "5월 1일")).toBeVisible();
      await openScreen(page, "/calendar?month=2036-05&date=2036-05-03", page.getByText("5월 3일 토요일"));
      await expect(getRow(page, title)).toHaveCount(0);

      // Act: 고치기
      await openScreen(page, "/calendar?month=2036-05&date=2036-05-01", getRow(page, title));
      await getRow(page, title).click();
      await expect(page.locator("#event-end-date")).toContainText("2036.05.02");
      await pickDate(page, "#event-end-date", "2036-05-01");
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert: 눌렀던 날로 돌아오고 끝 날짜가 바뀐다
      await expect(page).toHaveURL(/date=2036-05-01/);
      await expect(getRow(page, title)).toContainText("04.29–05.01");
      await openScreen(page, "/calendar?month=2036-05&date=2036-05-02", page.getByText("5월 2일 금요일"));
      await expect(getRow(page, title)).toHaveCount(0);

      // Act: 지우기
      await openScreen(page, "/calendar?month=2036-05&date=2036-05-01", getRow(page, title));
      await getRow(page, title).click();
      await page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true").click();
      await expect(page.getByRole("dialog").getByRole("heading", { name: "기간 일정을 지울까요?" })).toBeVisible();
      await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
      await page.waitForURL(/\/calendar/);

      // Assert
      await openScreen(page, "/calendar?month=2036-04&date=2036-04-30", page.getByText("4월 30일 수요일"));
      await expect(getRow(page, title)).toHaveCount(0);
    } finally {
      await deleteEventsByTitle(title);
    }
  });

  test("기간과 반복은 함께 고를 수 없다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/events/new?date=2036-03-05", page.locator("#event-title"));
    const period = page.getByRole("checkbox", { name: "기간" });
    const repeat = page.locator("#event-repeat");

    // Act & Assert: 기간을 켜면 반복이 막힌다
    await period.check();
    await expect(repeat).toBeDisabled();
    await expect(page.getByText("기간과 반복은 함께 쓸 수 없어요.")).toBeVisible();

    // Act & Assert: 기간을 끄고 반복을 고르면 기간이 막힌다
    await period.uncheck();
    await expect(page.getByText("기간과 반복은 함께 쓸 수 없어요.")).toHaveCount(0);
    await repeat.selectOption("weekly");
    await expect(period).toBeDisabled();
  });

  test("끝 날짜를 고르지 않거나 시작 날짜보다 앞이면 저장하지 않고 알려 준다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/events/new?date=2036-03-05", page.locator("#event-title"));
    await page.locator("#event-title").fill("E2E 저장되면 안 되는 기간");
    await page.getByRole("checkbox", { name: "기간" }).check();

    // Act & Assert: 끝 날짜 없음
    await page.getByRole("button", { name: "저장" }).click();
    await expect(page.getByText("끝 날짜를 골라 주세요.")).toBeVisible();

    // Act: 달력은 시작 다음 날부터 고를 수 있으므로, 끝 날짜를 고른 뒤 시작 날짜를 그 뒤로 옮긴다
    await pickDate(page, "#event-end-date", "2036-03-12");
    await pickDate(page, "#event-date", "2036-03-19");
    await page.getByRole("button", { name: "저장" }).click();

    // Assert
    await expect(page.getByText("끝 날짜는 시작 날짜보다 뒤여야 해요.")).toBeVisible();
    await expect(page).toHaveURL(/\/events\/new/);
  });

  test("진행 중인 기간 일정은 홈 칸의 오늘 일정으로 세고 아직 기록을 권하지 않는다", async ({ page }, testInfo) => {
    // Arrange: 오늘의 공통 일정 2개가 칸을 채우므로 수로 확인한다. 만든 순서가 뒤라 다른 테스트의 공통 일정을 밀어내지 않는다
    const now = Date.now();
    const today = toKstDate(new Date(now));
    const title = createTitle("진행 중", testInfo.project.name);
    const deleteEvent = await createDisposablePeriodEvent({
      id: randomUUID(),
      title,
      date: toKstDate(new Date(now - DAY_MS)),
      endDate: toKstDate(new Date(now + DAY_MS)),
    });

    try {
      // Act & Assert
      await openScreen(page, "/", page.getByText(/^외 \d+개$/));
      await openScreen(page, `/calendar?date=${today}`, getRow(page, title));
      await expect(page.getByRole("link", { name: `${title} 기록 남기기` })).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });

  test("끝난 기간 일정에서 기록 남기기를 누르면 기간을 채운 작성 화면이 열린다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTitle("끝난 기간", testInfo.project.name);
    const deleteEvent = await createDisposablePeriodEvent({ id: randomUUID(), title, date: "2020-03-10", endDate: "2020-03-12" });

    try {
      // Act: 기간의 가운데 날에서 누른다
      await openScreen(page, "/calendar?month=2020-03&date=2020-03-11", getRow(page, title));
      await page.getByRole("link", { name: `${title} 기록 남기기` }).click();

      // Assert
      await expect(page.locator("#date")).toContainText("2020.03.10");
      await expect(page.locator("#endDate")).toContainText("2020.03.12");
      await expect(page.locator("#title")).toHaveValue(title);
    } finally {
      await deleteEvent();
    }
  });
});
