import { test as base, type Locator, type Page } from "@playwright/test";

export interface SafeArea {
  top: number;
  bottom: number;
}

export interface DeviceOptions {
  /** 기기의 위·아래 safe-area(CSS px) */
  safeArea: SafeArea;
}

/** 모든 페이지에 기기의 safe-area를 넣는 Playwright test */
export const test = base.extend<DeviceOptions>({
  safeArea: [{ top: 0, bottom: 0 }, { option: true }],
  page: async ({ page, safeArea }, provide) => {
    const session = await page.context().newCDPSession(page);
    await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { ...safeArea, left: 0, right: 0 } });
    await provide(page);
  },
});

export { expect } from "@playwright/test";

/**
 * 화면 틀의 내용 스크롤 영역.
 *
 * @example await getScrollArea(page).evaluate((element) => element.scrollHeight)
 */
export const getScrollArea = (page: Page): Locator => page.locator("main > .overflow-y-auto");

/**
 * 주소를 열고, 내용과 이미지가 다 그려진 뒤에 재도록 기다린다.
 *
 * @example await openScreen(page, "/todos", page.getByText("할 일"))
 */
export const openScreen = async (page: Page, path: string, ready: Locator): Promise<void> => {
  await page.goto(path);
  await ready.first().waitFor();
  await page.waitForLoadState("networkidle");
};

/**
 * 문서가 화면 높이를 넘는 만큼(px). 0이어야 문서가 아니라 틀 안쪽만 스크롤된다.
 *
 * @example expect(await getDocumentOverflow(page)).toBe(0)
 */
export const getDocumentOverflow = (page: Page): Promise<number> =>
  page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);

/**
 * 내용 스크롤 영역의 세로·가로 넘침(px).
 *
 * @example expect((await getScrollAreaOverflow(page)).vertical).toBe(0)
 */
export const getScrollAreaOverflow = (page: Page): Promise<{ vertical: number; horizontal: number }> =>
  getScrollArea(page).evaluate((element) => ({
    vertical: element.scrollHeight - element.clientHeight,
    horizontal: element.scrollWidth - element.clientWidth,
  }));
