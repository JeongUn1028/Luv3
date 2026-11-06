import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { ANNIVERSARY_DATE, formatSinceLabel } from "@/lib/anniversary";
import { BASE_URL, MEMBER_STATE_PATH } from "./support/constants";
import { createDisposableMember } from "./support/seed";
import { expect, test } from "./support/test";

/** 하트 120 + 선까지 40 + 선 1 + 문구까지 20 + 문구 줄 21. 예전 시작 그림에서 잰 값과 같다 */
const SPLASH_CONTENT_HEIGHT = 202;
const HEART_SIZE = 120;
const HEART_TO_LINE = 40;

const NO_SESSION = { cookies: [], origins: [] };

const getSplash = (page: Page): Locator => page.locator("[data-startup-splash]");

/**
 * 시작 화면의 움직임을 멈춘 채로 페이지를 열게 한다. 불러오는 시간과 상관없이 잴 수 있고,
 * 나중에 시작 화면이 또 그려져도 저절로 사라지지 않아 다시 나왔는지 놓치지 않는다.
 */
const holdSplash = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.head) return;
      observer.disconnect();
      const style = document.createElement("style");
      style.textContent = "[data-startup-splash], [data-startup-splash] * { animation-play-state: paused !important; }";
      document.head.append(style);
    });
    observer.observe(document, { childList: true, subtree: true });
  });
};

/** 멈춰 둔 움직임을 끝까지 보낸다 */
const finishSplash = async (page: Page): Promise<void> => {
  await getSplash(page).evaluate((splash) => splash.getAnimations({ subtree: true }).forEach((animation) => animation.finish()));
  await expect(getSplash(page)).toHaveCount(0);
};

const signIn = async (page: Page, email: string, password: string): Promise<void> => {
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
};

test.describe("앱 시작 화면", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" }, storageState: NO_SESSION });

  test("예전 시작 그림과 같은 자리에 같은 크기로 그린다", async ({ page, viewport }) => {
    // Arrange
    await holdSplash(page);
    const width = viewport?.width ?? 0;
    const height = viewport?.height ?? 0;
    const heartTop = (height - SPLASH_CONTENT_HEIGHT) / 2;

    // Act
    await page.goto("/login");

    // Assert
    const splash = getSplash(page);
    await expect(splash).toHaveCSS("position", "fixed");
    expect(await splash.boundingBox()).toEqual({ x: 0, y: 0, width, height });
    expect(await splash.locator("svg").boundingBox()).toEqual({ x: (width - HEART_SIZE) / 2, y: heartTop, width: HEART_SIZE, height: HEART_SIZE });
    // 선은 폭 0에서 늘어나므로 다 늘어난 뒤에 잰다
    await splash.locator("svg + div").evaluate((line) => line.getAnimations().forEach((animation) => animation.finish()));
    expect(await splash.locator("svg + div").boundingBox()).toEqual({ x: (width - 32) / 2, y: heartTop + HEART_SIZE + HEART_TO_LINE, width: 32, height: 1 });
    await expect(splash.locator("p")).toHaveText(formatSinceLabel(ANNIVERSARY_DATE));
  });

  test("돌아가는 동안에도 아래 화면을 누를 수 있고 끝나면 화면에서 없앤다", async ({ page }) => {
    // Arrange
    await holdSplash(page);
    await page.goto("/login");
    await expect(getSplash(page)).toBeVisible();

    // Act
    const emailInput = page.getByLabel("이메일");
    await emailInput.click();

    // Assert
    await expect(emailInput).toBeFocused();
    await finishSplash(page);
  });

  test("화면 코드가 오지 않아도 CSS만으로 끝나 누르기를 막지 않는다", async ({ browser, baseURL }) => {
    // Arrange
    const context = await browser.newContext({ baseURL, javaScriptEnabled: false, reducedMotion: "no-preference", storageState: NO_SESSION });
    const page = await context.newPage();

    // Act
    await page.goto("/login");

    // Assert
    const splash = getSplash(page);
    await expect(splash).toHaveCount(1);
    await expect(splash).toHaveCSS("pointer-events", "none");
    await expect(splash).toBeHidden();
    await context.close();
  });

  test("로그인과 로그아웃으로 문서를 새로 받아도 다시 나오지 않고, 새로 열면 다시 나온다", async ({ page }) => {
    // Arrange
    const password = randomUUID();
    const { email, remove } = await createDisposableMember(password);
    await holdSplash(page);
    await page.goto("/login", { waitUntil: "networkidle" });

    try {
      // Act: 로그인해 홈으로 옮긴다
      await signIn(page, email, password);
      await page.waitForURL(`${BASE_URL}/`);

      // Assert
      await expect(getSplash(page)).toBeHidden();

      // Act: 앱을 새로 연다
      await page.reload();

      // Assert
      await expect(getSplash(page)).toBeVisible();

      // Act: 로그아웃해 로그인 화면으로 옮긴다
      await finishSplash(page);
      await page.goto("/settings", { waitUntil: "networkidle" });
      await finishSplash(page);
      await page.getByRole("button", { name: "로그아웃" }).click();
      await page.waitForURL(/\/login/);

      // Assert
      await expect(page.getByLabel("이메일")).toBeVisible();
      await expect(getSplash(page)).toBeHidden();
    } finally {
      await remove();
    }
  });

  test.describe("로그인한 상태에서", () => {
    test.use({ storageState: MEMBER_STATE_PATH });

    test("앱 안에서 화면을 옮겨도 다시 나오지 않는다", async ({ page }) => {
      // Arrange
      await holdSplash(page);
      await page.goto("/", { waitUntil: "networkidle" });
      await finishSplash(page);

      // Act
      await page.locator('nav a[href="/records"]').locator("visible=true").click();
      await page.waitForURL(`${BASE_URL}/records`);
      await page.goBack();
      await page.waitForURL(`${BASE_URL}/`);

      // Assert
      await expect(page.locator('nav a[href="/records"]').locator("visible=true")).toBeVisible();
      await expect(getSplash(page)).toHaveCount(0);
    });

    test("앱 안의 일반 링크로 문서를 새로 받거나 뒤로 가도 다시 나오지 않는다", async ({ page }) => {
      // Arrange: 오류 화면의 "홈으로"처럼 문서를 새로 받는 링크를 누른다
      await holdSplash(page);
      await page.goto("/", { waitUntil: "networkidle" });
      await finishSplash(page);

      // Act
      await page.evaluate(() => {
        const link = document.createElement("a");
        link.href = "/todos";
        document.body.append(link);
        link.click();
      });
      await page.waitForURL(`${BASE_URL}/todos`);

      // Assert
      await expect(page.locator('nav a[href="/todos"]').locator("visible=true")).toBeVisible();
      await expect(getSplash(page)).toBeHidden();

      // Act
      await page.goBack();
      await page.waitForURL(`${BASE_URL}/`);

      // Assert
      await expect(page.locator('nav a[href="/records"]').locator("visible=true")).toBeVisible();
      await expect(getSplash(page)).toBeHidden();
    });

    test("돌아가는 중에 탭을 눌러도 전환되는 화면이 시작 화면을 덮지 않는다", async ({ page }) => {
      // Arrange
      await holdSplash(page);
      await page.goto("/", { waitUntil: "networkidle" });
      const heart = getSplash(page).locator("svg");
      await heart.evaluate((svg) => svg.getAnimations({ subtree: true }).forEach((animation) => animation.finish()));
      const clip = await heart.boundingBox();
      if (!clip) throw new Error("하트가 화면에 있어야 잴 수 있습니다");
      const before = await page.screenshot({ clip });
      // 화면 전환은 0.14초라 늦춰서 중간을 잰다
      await page.addStyleTag({ content: "::view-transition-new(*) { animation-duration: 4s !important; }" });

      // Act
      await page.locator('nav a[href="/records"]').locator("visible=true").click({ noWaitAfter: true });
      await page.waitForFunction(() => document.getAnimations().some((animation) => animation.effect instanceof KeyframeEffect && animation.effect.pseudoElement?.includes("view-transition")));
      await page.waitForTimeout(2000);

      // Assert
      expect((await page.screenshot({ clip })).equals(before)).toBe(true);
    });
  });

  test.describe("움직임 줄이기 설정이면", () => {
    test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("움직이는 시작 화면을 보여 주지 않는다", async ({ page }) => {
      // Arrange
      await holdSplash(page);

      // Act
      await page.goto("/login");

      // Assert
      await expect(page.getByLabel("이메일")).toBeVisible();
      await expect(getSplash(page)).toBeHidden();
    });
  });
});
