import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { toKstDate } from "../src/lib/anniversary";
import { pickDate } from "./support/date-picker";
import { createDisposableRepeatingEvent, deleteEventById, deleteEventsByTitle, skipEventDate, stopEventRepeat } from "./support/seed";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

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

test.describe("반복 일정 폼", () => {
  /** 두 기기가 같은 DB를 나란히 쓰므로 제목에 기기 이름을 붙인다 */
  const getRow = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(title) });

  test("새 일정을 매주로 저장하면 끝나는 날까지 해당 요일마다 나온다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 폼 매주", testInfo);
    await openScreen(page, "/events/new?date=2036-03-05", page.locator("#event-title"));

    try {
      // Act
      await page.locator("#event-title").fill(title);
      await page.locator("#event-repeat").selectOption("weekly");
      await pickDate(page, "#event-repeat-until", "2036-03-19");
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert
      await expect(getRow(page, title)).toContainText("매주");
      await openScreen(page, "/calendar?month=2036-03&date=2036-03-19", getRow(page, title));
      await openScreen(page, "/calendar?month=2036-03&date=2036-03-26", page.getByText("3월 26일 수요일"));
      await expect(getRow(page, title)).toHaveCount(0);
    } finally {
      await deleteEventsByTitle(title);
    }
  });

  test("끝나는 날이 시작하는 날보다 앞이면 저장하지 않고 알려 준다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/events/new?date=2036-03-05", page.locator("#event-title"));

    // Act
    await page.locator("#event-title").fill("E2E 저장되면 안 되는 일정");
    await page.locator("#event-repeat").selectOption("monthly");
    // 달력은 시작 다음 날부터 고를 수 있으므로, 끝나는 날을 고른 뒤 시작하는 날을 그 뒤로 옮긴다
    await pickDate(page, "#event-repeat-until", "2036-03-12");
    await pickDate(page, "#event-date", "2036-03-19");
    await page.getByRole("button", { name: "저장" }).click();

    // Assert
    await expect(page.getByText("끝나는 날은 시작하는 날 뒤로 골라 주세요.")).toBeVisible();
    await expect(page).toHaveURL(/\/events\/new/);
  });

  test("이 날만 고치면 그날만 바뀌고 다른 날은 그대로다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 이 날만", testInfo);
    const changedTitle = `${title} 옮김`;
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2037-03-04", repeatRule: "weekly" });

    try {
      // Act: 이 날만이 기본이고, 날짜 칸에는 누른 날이 채워진다
      await openScreen(page, `/events/${id}/edit?date=2037-03-18`, page.locator("#event-title"));
      await expect(page.getByRole("radio", { name: "이 날만" })).toBeChecked();
      await expect(page.locator("#event-date")).toContainText("2037.03.18");
      await expect(page.locator("#event-repeat")).toHaveCount(0);
      await page.locator("#event-title").fill(changedTitle);
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert
      await expect(getRow(page, changedTitle)).toBeVisible();
      await expect(getRow(page, changedTitle)).not.toContainText("매주");
      await openScreen(page, "/calendar?month=2037-03&date=2037-03-25", getRow(page, title));
      await expect(getRow(page, title)).toContainText("매주");
    } finally {
      await deleteEvent();
    }
  });

  test("이 날만 고친 일정은 반복 칸이 없고 다른 일정처럼 고친다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 따로 나온", testInfo);
    const changedTitle = `${title} 옮김`;
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2038-03-03", repeatRule: "weekly" });

    try {
      await openScreen(page, `/events/${id}/edit?date=2038-03-17`, page.locator("#event-title"));
      await page.locator("#event-title").fill(changedTitle);
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Act
      await getRow(page, changedTitle).click();
      await page.locator("#event-title").locator("visible=true").waitFor();

      // Assert
      await expect(page.getByRole("radio", { name: "이 날만" })).toHaveCount(0);
      await expect(page.locator("#event-repeat")).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });

  test("전체를 고르면 시작하는 날이 채워지고 저장하면 모든 날이 바뀐다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 전체", testInfo);
    const changedTitle = `${title} 바꿈`;
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2039-03-02", repeatRule: "weekly" });

    try {
      // Act
      await openScreen(page, `/events/${id}/edit?date=2039-03-16`, page.locator("#event-title"));
      await page.getByText("전체", { exact: true }).click();
      await expect(page.locator("#event-date")).toContainText("2039.03.02");
      await expect(page.locator("#event-repeat")).toHaveValue("weekly");
      await page.locator("#event-title").fill(changedTitle);
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert: 저장하면 누른 날로 돌아오고, 다른 날도 바뀌어 있다
      await expect(getRow(page, changedTitle)).toBeVisible();
      await openScreen(page, "/calendar?month=2039-03&date=2039-03-23", getRow(page, changedTitle));
    } finally {
      await deleteEvent();
    }
  });

  test("이 날만 지우면 그날만 사라지고 다른 날은 남는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 하루 지우기", testInfo);
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2040-03-07", repeatRule: "weekly" });

    try {
      // Act
      await openScreen(page, `/events/${id}/edit?date=2040-03-14`, page.locator("#event-title"));
      await page.getByRole("button", { name: "삭제" }).click();
      await expect(page.getByRole("dialog")).toContainText("3월 14일 수요일 하루만");
      await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert
      await expect(page.getByRole("heading", { name: "3월 14일 수요일" })).toBeVisible();
      await expect(getRow(page, title)).toHaveCount(0);
      await openScreen(page, "/calendar?month=2040-03&date=2040-03-21", getRow(page, title));
    } finally {
      await deleteEvent();
    }
  });

  test("전체를 지우면 모든 날과 따로 고친 날이 함께 사라진다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 전체 지우기", testInfo);
    const changedTitle = `${title} 옮김`;
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2041-03-06", repeatRule: "weekly" });

    try {
      await openScreen(page, `/events/${id}/edit?date=2041-03-20`, page.locator("#event-title"));
      await page.locator("#event-title").fill(changedTitle);
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Act
      await openScreen(page, `/events/${id}/edit?date=2041-03-13`, page.locator("#event-title"));
      await page.getByText("전체", { exact: true }).click();
      await page.getByRole("button", { name: "삭제" }).click();
      await expect(page.getByRole("dialog")).toContainText("따로 고친 날도 함께");
      await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert
      await expect(getRow(page, title)).toHaveCount(0);
      await openScreen(page, "/calendar?month=2041-03&date=2041-03-20", page.getByText("3월 20일 수요일"));
      await expect(getRow(page, changedTitle)).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });

  test("전체에서 시작 날짜를 옮기면 지웠던 날이 새 날짜로 돌아오고 따로 고친 일정은 남는다", async ({ page }, testInfo) => {
    // Arrange: 2048-03-04는 수요일이다. 3월 11일을 지우고, 3월 18일은 따로 고친다
    const id = randomUUID();
    const title = createTestName("E2E 새로 시작", testInfo);
    const movedTitle = `${title} 옮김`;
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2048-03-04", repeatRule: "weekly", exceptionDates: ["2048-03-11"] });

    try {
      await openScreen(page, `/events/${id}/edit?date=2048-03-18`, page.locator("#event-title"));
      await page.locator("#event-title").fill(movedTitle);
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Act: 전체를 하루 뒤로 옮긴다
      await openScreen(page, `/events/${id}/edit?date=2048-03-25`, page.locator("#event-title"));
      await page.getByText("전체", { exact: true }).click();
      await pickDate(page, "#event-date", "2048-03-05");
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert: 지웠던 주의 새 날에 반복이 다시 오고
      await openScreen(page, "/calendar?month=2048-03&date=2048-03-12", getRow(page, title));

      // Act: 원래 일정을 지워도
      await getRow(page, title).first().click();
      await page.locator("#event-title").locator("visible=true").waitFor();
      await page.getByText("전체", { exact: true }).locator("visible=true").click();
      await page.getByRole("button", { name: "삭제" }).locator("visible=true").click();
      await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert: 따로 고친 일정은 남는다
      await openScreen(page, "/calendar?month=2048-03&date=2048-03-18", getRow(page, movedTitle));
    } finally {
      await deleteEvent();
      await deleteEventsByTitle(movedTitle);
    }
  });

  test("이 날만 고치는 사이 상대가 그날을 고쳤으면 저장하지 않고 알려 준다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("E2E 겹친 저장", testInfo);
    const deleteEvent = await createDisposableRepeatingEvent({ id, title, date: "2044-03-02", repeatRule: "weekly" });

    try {
      await openScreen(page, `/events/${id}/edit?date=2044-03-09`, page.locator("#event-title"));
      await skipEventDate(id, "2044-03-09");

      // Act
      await page.locator("#event-title").fill(`${title} 옮김`);
      await page.getByRole("button", { name: "저장" }).click();

      // Assert
      await expect(page.getByRole("main").getByRole("alert")).toHaveText("이 날 일정은 이미 고쳤거나 지웠어요. 캘린더에서 다시 확인해 주세요.");
    } finally {
      await deleteEvent();
    }
  });

  test("이 날만 지우는 사이 상대가 반복 일정을 지웠으면 지운 것으로 보고 캘린더로 간다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const deleteEvent = await createDisposableRepeatingEvent({ id, title: createTestName("E2E 이미 지운", testInfo), date: "2045-03-01", repeatRule: "weekly" });

    try {
      await openScreen(page, `/events/${id}/edit?date=2045-03-08`, page.locator("#event-title"));
      await deleteEventById(id);

      // Act
      await page.getByRole("button", { name: "삭제" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();

      // Assert
      await page.waitForURL(/\/calendar/);
    } finally {
      await deleteEvent();
    }
  });

  test("이 날만 지우는 사이 상대가 반복을 껐으면 지우지 못했다고 알려 준다", async ({ page }, testInfo) => {
    // Arrange: 일정은 남아 있으므로 지운 척하고 넘어가면 안 된다
    const id = randomUUID();
    const deleteEvent = await createDisposableRepeatingEvent({ id, title: createTestName("E2E 반복 끔", testInfo), date: "2046-03-07", repeatRule: "weekly" });

    try {
      await openScreen(page, `/events/${id}/edit?date=2046-03-14`, page.locator("#event-title"));
      await stopEventRepeat(id);

      // Act
      await page.getByRole("button", { name: "삭제" }).click();
      await page.getByRole("dialog").getByRole("button", { name: "삭제" }).click();

      // Assert
      await expect(page.getByRole("dialog").getByRole("alert")).toHaveText("일정을 지우지 못했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      await deleteEvent();
    }
  });

  test("이미 고쳤거나 지운 날의 주소를 열면 반복 전체를 고치지 않게 막는다", async ({ page }, testInfo) => {
    // Arrange: 2042-03-05는 수요일이고 3월 12일은 건너뛰는 날이다
    const id = randomUUID();
    const deleteEvent = await createDisposableRepeatingEvent({
      id,
      title: createTestName("E2E 낡은 줄", testInfo),
      date: "2042-03-05",
      repeatRule: "weekly",
      exceptionDates: ["2042-03-12"],
    });

    try {
      // Act
      await openScreen(page, `/events/${id}/edit?date=2042-03-12`, page.getByText("이 날 일정은 이미 고쳤거나 지웠어요"));

      // Assert
      await expect(page.locator("#event-title")).toHaveCount(0);
      await expect(page.getByRole("link", { name: "캘린더로" })).toBeVisible();
    } finally {
      await deleteEvent();
    }
  });

  test("날을 담지 않은 주소를 열면 범위를 고르지 않고 반복 전체를 고친다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const deleteEvent = await createDisposableRepeatingEvent({
      id,
      title: createTestName("E2E 날 없는 주소", testInfo),
      date: "2047-03-06",
      repeatRule: "weekly",
    });

    try {
      // Act
      await openScreen(page, `/events/${id}/edit`, page.locator("#event-title"));

      // Assert
      await expect(page.getByRole("radio", { name: "이 날만" })).toHaveCount(0);
      await expect(page.locator("#event-date")).toContainText("2047.03.06");
      await expect(page.locator("#event-repeat")).toHaveValue("weekly");
    } finally {
      await deleteEvent();
    }
  });

  test("범위와 끝나는 날을 모두 보여 줘도 가로로 넘치지 않고 저장 버튼까지 내려간다", async ({ page }, testInfo) => {
    // Arrange: 칸이 가장 많은 화면이다
    const id = randomUUID();
    const deleteEvent = await createDisposableRepeatingEvent({
      id,
      title: createTestName("E2E 칸 많은 폼", testInfo),
      date: "2043-03-04",
      repeatRule: "weekly",
    });

    try {
      await openScreen(page, `/events/${id}/edit?date=2043-03-11`, page.locator("#event-title"));

      // Act
      await page.getByText("전체", { exact: true }).click();
      await page.getByText("종일", { exact: true }).click();
      await expect(page.locator("#event-repeat-until")).toBeVisible();
      const saveButton = page.getByRole("button", { name: "저장" });
      await saveButton.scrollIntoViewIfNeeded();

      // Assert
      await expect(saveButton).toBeInViewport({ ratio: 1 });
      expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);
    } finally {
      await deleteEvent();
    }
  });
});
