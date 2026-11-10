import type { Locator, Page } from "@playwright/test";
import { toKstDate } from "@/lib/anniversary";
import { addDays } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { getVisibleLink, installClockBeforeMidnight, returnToApp } from "./support/actions";
import { expect, openScreen, test } from "./support/test";

const NEW_RECORD_PATH = "/dates/new";
const MINUTE_MS = 60_000;

const getDateField = (page: Page): Locator => page.locator("#date").locator("visible=true");
const getTitleField = (page: Page): Locator => page.locator("#title").locator("visible=true");

/** 날짜 칸은 "2026.11.10 화요일"처럼 보인다 */
const toShownDate = (date: string): string => date.replaceAll("-", ".");

/**
 * 한국 날짜로 오늘 0시 10분 전으로 시계를 맞추고 기록 목록에서 새 기록 폼을 연다.
 * 서버는 실제 시각으로 그리므로 폼은 화면 안에서 옮겨 열어 브라우저 시계로 날짜를 정하게 한다.
 */
const openNewRecordBeforeMidnight = async (page: Page): Promise<{ today: string; yesterday: string }> => {
  const today = toKstDate(new Date());
  const yesterday = addDays(today, -1);
  await installClockBeforeMidnight(page);
  await openScreen(page, RECORDS_PATH, getVisibleLink(page, NEW_RECORD_PATH));
  await getVisibleLink(page, NEW_RECORD_PATH).tap();
  await page.waitForURL(`**${NEW_RECORD_PATH}`);
  await expect(getDateField(page)).toContainText(toShownDate(yesterday));
  return { today, yesterday };
};

test.describe("자정이 지난 뒤 새 기록 폼을 다시 보면", () => {
  test("숨겨 둔 폼에 아무것도 쓰지 않았으면 날짜가 오늘로 바뀐다", async ({ page }) => {
    // Arrange
    const { today } = await openNewRecordBeforeMidnight(page);
    await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
    await page.waitForURL(`**${RECORDS_PATH}`);

    // Act
    await page.clock.fastForward(15 * MINUTE_MS);
    await getVisibleLink(page, NEW_RECORD_PATH).tap();
    await page.waitForURL(`**${NEW_RECORD_PATH}`);

    // Assert
    await expect(getDateField(page)).toContainText(toShownDate(today));
  });

  test("보고 있던 폼에 아무것도 쓰지 않았으면 앱으로 돌아올 때 날짜가 오늘로 바뀐다", async ({ page }) => {
    // Arrange
    const { today } = await openNewRecordBeforeMidnight(page);

    // Act
    await page.clock.fastForward(15 * MINUTE_MS);
    await returnToApp(page);

    // Assert
    await expect(getDateField(page)).toContainText(toShownDate(today));
  });

  test("쓰던 내용이 있으면 날짜와 쓴 내용을 그대로 둔다", async ({ page }) => {
    // Arrange
    const { yesterday } = await openNewRecordBeforeMidnight(page);
    await getTitleField(page).fill("어제 데이트");

    // Act
    await page.clock.fastForward(15 * MINUTE_MS);
    await returnToApp(page);

    // Assert: 폼 주소에서는 앱에 돌아와도 화면을 새로 받지 않아(#164) 기다릴 요청이 없다. 다시 그릴 만큼만 기다린다
    await page.waitForTimeout(2_000);
    await expect(getDateField(page)).toContainText(toShownDate(yesterday));
    await expect(getTitleField(page)).toHaveValue("어제 데이트");
  });
});
