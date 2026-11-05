import type { Locator, Page } from "@playwright/test";
import { E2E_MEMBER } from "./support/constants";
import { expect, openScreen, test } from "./support/test";

const getStrip = (page: Page): Locator => page.locator("[data-status-bar-strip]");

/** WebKit처럼 pointer-events를 무시하고 맨 위 가운데에서 가장 위에 있는 요소를 찾아, 그 요소가 띠인지 본다 */
const isStripOnTopEdge = (page: Page): Promise<boolean> =>
  page.evaluate(() => {
    const strip = document.querySelector<HTMLElement>("[data-status-bar-strip]");
    if (!strip) return false;
    strip.style.pointerEvents = "auto";
    const isOnTop = document.elementFromPoint(window.innerWidth / 2, 4) === strip;
    strip.style.pointerEvents = "";
    return isOnTop;
  });

test.describe("상태바 자리의 고정 띠", () => {
  test("상태바 자리를 빈틈없이 덮고 스크롤해도 움직이지 않는다", async ({ page, safeArea, viewport }) => {
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));

    expect(await getStrip(page).boundingBox()).toEqual({ x: 0, y: 0, width: viewport?.width, height: safeArea.top });
    await expect(getStrip(page)).toHaveCSS("position", "fixed");
  });

  test("앱 배경과 같은 불투명한 색이고 누르기를 막지 않는다", async ({ page }) => {
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));

    const bodyColor = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    await expect(getStrip(page)).toHaveCSS("background-color", bodyColor);
    await expect(getStrip(page)).toHaveCSS("pointer-events", "none");
  });

  test("머리글이 있는 화면에서 맨 위 가운데의 가장 위 요소다", async ({ page }) => {
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));

    expect(await isStripOnTopEdge(page)).toBe(true);
  });

  test("홈 로고를 가리지 않는다", async ({ page }) => {
    await openScreen(page, "/", page.getByRole("button", { name: /커플 사진/ }));
    const clip = { x: 0, y: 0, width: page.viewportSize()?.width ?? 0, height: 120 };

    const withStrip = await page.screenshot({ clip });
    await getStrip(page).evaluate((element) => {
      element.style.display = "none";
    });
    const withoutStrip = await page.screenshot({ clip });

    expect(withStrip.equals(withoutStrip)).toBe(true);
  });

  test.describe("로그아웃 상태", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("로그인 화면에도 있다", async ({ page, safeArea }) => {
      await openScreen(page, "/login", page.getByRole("button", { name: "로그인" }));

      expect((await getStrip(page).boundingBox())?.height).toBe(safeArea.top);
    });

    test("머리글이 없는 로그인 화면에서도 맨 위 가운데의 가장 위 요소다", async ({ page }) => {
      await openScreen(page, "/login", page.getByRole("button", { name: "로그인" }));

      expect(await isStripOnTopEdge(page)).toBe(true);
    });
  });
});
