import type { Page } from "@playwright/test";

/**
 * 그 뒤로 시작하는 CSS 움직임의 이름을 모은다. 짧게 끝나는 움직임도 놓치지 않는다.
 *
 * @example await recordAnimations(page);
 */
export const recordAnimations = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.startedAnimations = "";
    document.addEventListener(
      "animationstart",
      (event) => {
        root.dataset.startedAnimations += `${event.animationName} `;
      },
      true,
    );
  });

/**
 * `recordAnimations` 뒤로 시작한 움직임 이름을 돌려준다.
 *
 * @example await expect.poll(() => readAnimations(page)).toContain("tab-pop");
 */
export const readAnimations = async (page: Page): Promise<string[]> => {
  const names = await page.locator("html").getAttribute("data-started-animations");
  return (names ?? "").trim().split(/\s+/).filter(Boolean);
};

/**
 * 화면이 그려질 때까지 기다린다. "움직임이 없다"를 잴 때 움직임이 시작되기도 전에 읽지 않게 한다.
 *
 * @example await waitForPaint(page);
 */
export const waitForPaint = (page: Page): Promise<void> =>
  page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
