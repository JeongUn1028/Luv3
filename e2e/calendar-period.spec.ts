import { PERIOD_RECORD } from "./support/constants";
import { getMonthCrossingPeriod } from "./support/period";
import { expect, openScreen, test } from "./support/test";

const period = getMonthCrossingPeriod();

test.describe("달을 넘는 기간 기록", () => {
  for (const { name, month, date } of [
    { name: "시작한 달", month: period.startMonth, date: period.startDate },
    { name: "끝난 달", month: period.endMonth, date: period.endDate },
  ]) {
    test(`${name}의 캘린더를 열면 기록이 나온다`, async ({ page }) => {
      await openScreen(page, `/calendar?month=${month}&date=${date}`, page.locator('button[aria-pressed="true"]'));

      await expect(page.locator(`a[href="/dates/${PERIOD_RECORD.id}"]`)).toBeVisible();
    });
  }
});
