import type { Page } from "@playwright/test";
import { toKstDate } from "../src/lib/anniversary";
import { addDays, shiftMonth } from "../src/lib/calendar/month";
import { getDatePicker, getPickerDay, getPickerMonthTitle, openDatePicker, pickDate } from "./support/date-picker";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";

const NEW_EVENT_PATH = "/events/new?date=2036-03-05";

const openNewEvent = async (page: Page): Promise<void> => {
  await openScreen(page, NEW_EVENT_PATH, page.locator("#event-title"));
};

test.describe("날짜 선택 창", () => {
  test("창은 일요일부터 시작하고 앞뒤 달의 날로 첫 주를 채운다", async ({ page }) => {
    // Arrange: 2036년 3월 1일은 토요일이다
    await openNewEvent(page);

    // Act
    await page.locator("#event-date").click();

    // Assert
    const picker = getDatePicker(page);
    await expect(picker.getByRole("columnheader")).toHaveText(["일", "월", "화", "수", "목", "금", "토"]);
    await expect(picker.locator("[data-date]").first()).toHaveAttribute("data-date", "2036-02-24");
    await expect(getPickerMonthTitle(page)).toHaveText("2036 · 03");
  });

  test("날을 고르면 창이 닫히고 칸에 날짜가 나오며 초점이 칸으로 돌아온다", async ({ page }) => {
    // Arrange
    await openNewEvent(page);
    await expect(page.locator("#event-date")).toContainText("2036.03.05 수요일");

    // Act
    await pickDate(page, "#event-date", "2036-03-12");

    // Assert
    await expect(page.locator("#event-date")).toContainText("2036.03.12 수요일");
    await expect(page.locator("#event-date")).toBeFocused();
  });

  test("달과 해를 옮겨 다른 해의 날도 고를 수 있다", async ({ page }) => {
    // Arrange
    await openNewEvent(page);

    // Act
    await pickDate(page, "#event-date", "2038-01-20");

    // Assert
    await expect(page.locator("#event-date")).toContainText("2038.01.20 수요일");
  });

  // 서버의 공휴일 키는 E2E에 없다. 브라우저가 우리 API에 묻는 요청을 가로채 답을 정한다(#200)
  test("공휴일이면 날짜 칸 이름에 공휴일 이름을 함께 읽는다", async ({ page }) => {
    // Arrange: 2036년 3월 1일(삼일절)은 토요일이다
    await page.route("**/api/holidays?year=2036", (route) =>
      route.fulfill({ json: { holidays: [{ date: "2036-03-01", name: "삼일절" }] } }),
    );
    await openNewEvent(page);

    // Act
    await openDatePicker(page, "#event-date");

    // Assert
    await expect(getPickerDay(page, "2036-03-01")).toHaveAttribute("aria-label", "2036년 3월 1일 토요일, 삼일절");
    await expect(getPickerDay(page, "2036-03-08")).toHaveAttribute("aria-label", "2036년 3월 8일 토요일");
  });

  test("공휴일을 받지 못해도 창은 그대로 날짜를 고를 수 있다", async ({ page }) => {
    // Arrange
    await page.route("**/api/holidays?year=*", (route) => route.fulfill({ status: 502, json: { code: "HOLIDAYS_FAILED" } }));
    await openNewEvent(page);

    // Act
    await pickDate(page, "#event-date", "2036-03-01");

    // Assert
    await expect(page.locator("#event-date")).toContainText("2036.03.01 토요일");
  });

  test("Esc와 창 바깥 누르기로 닫으면 날짜가 그대로다", async ({ page }) => {
    // Arrange
    await openNewEvent(page);
    const picker = getDatePicker(page);

    // Act + Assert: Esc
    await page.locator("#event-date").click();
    await page.keyboard.press("Escape");
    await expect(picker).toBeHidden();

    // Act + Assert: 창 바깥. 왼쪽 위 구석은 창이 가운데 있어 늘 바깥이다
    await openDatePicker(page, "#event-date");
    await page.mouse.click(2, 2);
    await expect(picker).toBeHidden();
    await expect(page.locator("#event-date")).toContainText("2036.03.05 수요일");
  });

  test("화살표로 초점을 옮기고 달이 넘어가면 그 달을 보여 주며 Enter로 고른다", async ({ page }) => {
    // Arrange
    await openNewEvent(page);
    await page.locator("#event-date").click();
    await expect(getPickerDay(page, "2036-03-05")).toBeFocused();

    // Act: 아래로 네 번이면 4월 2일이다
    for (let week = 0; week < 4; week += 1) await page.keyboard.press("ArrowDown");

    // Assert
    await expect(getPickerDay(page, "2036-04-02")).toBeFocused();
    await expect(getPickerMonthTitle(page)).toHaveText("2036 · 04");

    // Act
    await page.keyboard.press("ArrowRight");
    await page.keyboard.press("Enter");

    // Assert
    await expect(page.locator("#event-date")).toContainText("2036.04.03 목요일");
  });

  test("기록 날짜는 오늘 뒤를 고를 수 없고 다음 달로 넘어갈 수 없다", async ({ page }) => {
    // Arrange
    const today = toKstDate(new Date());
    await openScreen(page, "/dates/new", page.locator("#memo"));

    // Act
    await page.locator("#date").locator("visible=true").click();

    // Assert
    const picker = getDatePicker(page);
    await expect(getPickerDay(page, today)).toBeEnabled();
    await expect(picker.getByRole("button", { name: "다음 달", exact: true })).toBeDisabled();
    await expect(picker.getByRole("button", { name: "다음 해", exact: true })).toBeDisabled();
    // 오늘이 달의 마지막 토요일이면 내일은 창에 없다
    const tomorrow = getPickerDay(page, addDays(today, 1));
    if ((await tomorrow.count()) > 0) await expect(tomorrow).toBeDisabled();
  });

  test("기록 끝 날짜는 시작 다음 날부터 고를 수 있다", async ({ page }) => {
    // Arrange: 시작을 지난달 10일로 두면 11일까지 언제나 오늘보다 앞이다
    const month = shiftMonth(toKstDate(new Date()).slice(0, 7), -1);
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await pickDate(page, "#date", `${month}-10`);
    await page.getByRole("checkbox", { name: "기간으로 남기기" }).check();

    // Act: 끝 날짜가 비어 있으면 시작 날짜의 달을 연다
    await openDatePicker(page, "#endDate");

    // Assert
    await expect(getPickerDay(page, `${month}-10`)).toBeDisabled();
    await expect(getPickerDay(page, `${month}-11`)).toBeEnabled();

    // Act
    await getPickerDay(page, `${month}-11`).click();

    // Assert
    await expect(page.locator("#endDate").locator("visible=true")).toContainText(`${month.replace("-", ".")}.11`);
  });

  test("끝나는 날은 지울 수 있지만 필수 날짜에는 지우기가 없다", async ({ page }) => {
    // Arrange
    await openNewEvent(page);
    await page.locator("#event-repeat").selectOption("weekly");
    await expect(page.locator("#event-repeat-until")).toContainText("날짜 선택");
    await pickDate(page, "#event-repeat-until", "2036-03-19");
    await expect(page.locator("#event-repeat-until")).toContainText("2036.03.19");

    // Act
    await openDatePicker(page, "#event-repeat-until");
    await getDatePicker(page).getByRole("button", { name: "지우기" }).click();

    // Assert
    await expect(page.locator("#event-repeat-until")).toContainText("날짜 선택");

    // Act
    await page.locator("#event-date").click();

    // Assert
    await expect(getDatePicker(page).getByRole("button", { name: "지우기" })).toHaveCount(0);
  });

  test("창은 화면 안에 들어오고 날짜 칸은 누르기 충분히 크며 폼이 옆으로 넘치지 않는다", async ({ page }) => {
    // Arrange: 6주가 필요한 달. 2036년 3월은 토요일에 시작해 31일이 월요일이다
    await openNewEvent(page);

    // Act
    await page.locator("#event-date").click();

    // Assert
    const box = await getDatePicker(page).boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(box?.x).toBeGreaterThanOrEqual(0);
    expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
    expect(box?.y).toBeGreaterThanOrEqual(0);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(viewport?.height ?? 0);
    const day = await getPickerDay(page, "2036-03-31").boundingBox();
    expect(day?.width).toBeGreaterThanOrEqual(44);
    expect(day?.height).toBeGreaterThanOrEqual(44);
    expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);
  });

  test("날짜 칸을 두 번 눌러도 창 아래 날짜가 눌려 값이 바뀌지 않는다", async ({ page }) => {
    // Arrange
    await openNewEvent(page);

    // Act: 첫 번째로 창이 열리고, 두 번째는 칸 자리에 뜬 창에 닿는다
    await page.locator("#event-date").dblclick();

    // Assert
    await expect(getDatePicker(page)).toBeVisible();
    await expect(page.locator("#event-date")).toContainText("2036.03.05 수요일");
  });

  test("눌러도 초점을 주지 않는 브라우저에서도 닫으면 초점이 앞 칸이 아니라 날짜 칸으로 돌아온다", async ({ page }) => {
    // Arrange: 아이폰 Safari는 버튼을 눌러도 초점을 옮기지 않는다. dispatchEvent의 click이 같은 상황을 만든다
    await openNewEvent(page);
    await page.locator("#event-title").focus();

    // Act
    await page.locator("#event-date").dispatchEvent("click");
    await getDatePicker(page).waitFor();
    await page.keyboard.press("Escape");

    // Assert
    await expect(page.locator("#event-date")).toBeFocused();
  });

  test("해 이동은 범위 끝을 넘으면 범위 안의 끝 달로 옮긴다", async ({ page }) => {
    // Arrange: 오늘이 끝인 기록 날짜에서 이번 달보다 11달 앞으로 간다
    const thisMonth = toKstDate(new Date()).slice(0, 7);
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await openDatePicker(page, "#date");
    const picker = getDatePicker(page);
    await picker.getByRole("button", { name: "이전 해", exact: true }).click();
    await picker.getByRole("button", { name: "이전 달", exact: true }).click();
    await picker.getByRole("button", { name: "다음 달", exact: true }).click();
    await picker.getByRole("button", { name: "다음 달", exact: true }).click();

    // Act: 이번 달보다 11달 앞에서 1년 뒤는 범위를 넘는다
    await picker.getByRole("button", { name: "다음 해", exact: true }).click();

    // Assert
    await expect(getPickerMonthTitle(page)).toHaveText(thisMonth.replace("-", " · "));
  });

  test("키보드로 누른 이동 버튼이 막혀도 초점이 창 안의 날짜로 옮겨 간다", async ({ page }) => {
    // Arrange
    const today = toKstDate(new Date());
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await openDatePicker(page, "#date");
    const picker = getDatePicker(page);
    await picker.getByRole("button", { name: "이전 달", exact: true }).click();

    // Act: 이번 달로 돌아오면 다음 달 버튼은 막힌다
    await picker.getByRole("button", { name: "다음 달", exact: true }).focus();
    await page.keyboard.press("Enter");

    // Assert
    await expect(getPickerDay(page, today)).toBeFocused();
  });

  test("끝나는 날은 시작하는 날 다음부터 고를 수 있다", async ({ page }) => {
    // Arrange
    await openNewEvent(page);
    await page.locator("#event-repeat").selectOption("weekly");

    // Act
    await page.locator("#event-repeat-until").click();

    // Assert
    await expect(getPickerDay(page, "2036-03-05")).toBeDisabled();
    await expect(getPickerDay(page, "2036-03-06")).toBeEnabled();
  });

  test("창을 연 채 뒤로 가면 창이 닫혀 탭을 누를 수 있다", async ({ page }) => {
    // Arrange: 앞 화면에서 눌러 들어와야 폼이 숨겨진 채 보존된다
    await openScreen(page, "/calendar", page.getByRole("link", { name: /일정 추가/ }).first());
    await page.getByRole("link", { name: /일정 추가/ }).first().click();
    await page.locator("#event-date").locator("visible=true").click();
    await getDatePicker(page).waitFor();

    // Act
    await page.goBack();
    await page.waitForURL(/\/calendar/);

    // Assert
    await page.getByRole("navigation", { name: "주요 화면" }).getByRole("link", { name: "기록" }).tap();
    await page.waitForURL(/\/records/);
  });
});
