import type { Locator, Page } from "@playwright/test";

/** ModalDialog의 DOUBLE_TAP_GUARD_MS보다 조금 길게 */
const OPEN_GUARD_WAIT_MS = 350;

/** 지금 열린 날짜 선택 창 */
export const getDatePicker = (page: Page): Locator => page.getByRole("dialog").locator("visible=true");

/** 창 안의 날짜 칸. 앞뒤 달의 날도 함께 보이므로 YYYY-MM-DD로 찾는다 */
export const getPickerDay = (page: Page, date: string): Locator => getDatePicker(page).locator(`[data-date="${date}"]`);

/** 창에서 보고 있는 달. 달을 옮길 때마다 화면 읽기가 읽어 주는 줄이다 */
export const getPickerMonthTitle = (page: Page): Locator => getDatePicker(page).locator('[aria-live="polite"]');

/**
 * 날짜 칸을 눌러 창을 연다. 창은 두 번 누르기를 막으려고 열린 직후 잠깐 누름을 받지 않으므로 그 시간을 기다린다.
 *
 * @example await openDatePicker(page, "#event-date");
 */
export const openDatePicker = async (page: Page, fieldSelector: string): Promise<void> => {
  await page.locator(fieldSelector).locator("visible=true").click();
  await getDatePicker(page).waitFor();
  await page.waitForTimeout(OPEN_GUARD_WAIT_MS);
};

const toMonthNumber = (month: string): number => {
  const [year = 0, monthOfYear = 0] = month.split("-").map(Number);
  return year * 12 + monthOfYear;
};

/**
 * 날짜 칸을 눌러 창을 열고, 그 날이 있는 달로 옮겨서 고른다.
 *
 * @example await pickDate(page, "#event-date", "2036-03-19");
 */
export const pickDate = async (page: Page, fieldSelector: string, date: string): Promise<void> => {
  await openDatePicker(page, fieldSelector);
  const picker = getDatePicker(page);

  // 창 제목은 "2036 · 03" 형식이다
  const shownMonth = ((await getPickerMonthTitle(page).textContent()) ?? "").replace(" · ", "-");
  const monthGap = toMonthNumber(date.slice(0, 7)) - toMonthNumber(shownMonth);
  const yearSteps = Math.trunc(monthGap / 12);
  const monthSteps = monthGap - yearSteps * 12;

  const clickRepeatedly = async (name: string, count: number): Promise<void> => {
    for (let step = 0; step < count; step += 1) {
      await picker.getByRole("button", { name, exact: true }).click();
    }
  };
  await clickRepeatedly(yearSteps > 0 ? "다음 해" : "이전 해", Math.abs(yearSteps));
  await clickRepeatedly(monthSteps > 0 ? "다음 달" : "이전 달", Math.abs(monthSteps));

  await getPickerDay(page, date).click();
  await picker.waitFor({ state: "hidden" });
};
