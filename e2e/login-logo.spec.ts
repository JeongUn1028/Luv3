import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { ANNIVERSARY_DATE, formatSinceLabel } from "@/lib/anniversary";
import { createDisposableMember } from "./support/seed";
import { expect, test } from "./support/test";

const NO_SESSION = { cookies: [], origins: [] };

/** 시작 화면(#131)과 같은 순서와 시간: 하트 0~0.55초 → 선 0.5~0.62초 → 문구 0.58~0.9초 */
const HEART_END_MS = 550;
const LINE_START_MS = 500;
const LETTERS_START_MS = 580;
const LETTERS_END_MS = 900;

interface DrawStep {
  name: string;
  start: number;
  end: number;
  iterations: number;
}

/** 시작 화면 안의 로고가 아니라 로그인 화면 본문의 로고 */
const getLoginLogo = (page: Page): Locator => page.locator("main [data-drawn-logo]");

/** 로고 그리기 움직임을 멈춘 채로 페이지를 열게 한다. 불러오는 시간과 상관없이 그리는 도중을 잴 수 있다 */
const holdLogo = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.head) return;
      observer.disconnect();
      const style = document.createElement("style");
      style.textContent = "[data-drawn-logo] * { animation-play-state: paused !important; }";
      document.head.append(style);
    });
    observer.observe(document, { childList: true, subtree: true });
  });
};

/** 로고의 움직임마다 이름·시작·끝 시각·반복 횟수를 시작 순서대로 읽는다 */
const readDrawSteps = (logo: Locator): Promise<DrawStep[]> =>
  logo.evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      .map((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return {
          name: animation instanceof CSSAnimation ? animation.animationName : "",
          start: Number(timing?.delay ?? 0),
          end: Number(timing?.endTime ?? 0),
          iterations: Number(timing?.iterations ?? 0),
        };
      })
      .sort((a, b) => a.start - b.start),
  );

/** 로고 움직임이 모두 끝나기를 기다린다 */
const waitForDrawn = async (logo: Locator): Promise<void> => {
  await logo.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished)));
};

/** 하트 선, 가운데 선, 문구가 모두 다 그려진 모습인지 읽는다 */
const readFinishedLook = (logo: Locator): Promise<{ dashOffsets: string[]; isLineFullWidth: boolean; letterOpacities: string[] }> =>
  logo.evaluate((element) => {
    // 움직임 없이는 none, 늘어나는 움직임이 끝난 뒤에는 같은 뜻의 1로 읽힌다
    const lineScale = getComputedStyle(element.querySelector("svg + div") ?? element).scale;
    return {
      dashOffsets: [...element.querySelectorAll("path")].map((path) => getComputedStyle(path).strokeDashoffset),
      isLineFullWidth: lineScale === "none" || lineScale.split(" ").every((value) => value === "1"),
      letterOpacities: [...element.querySelectorAll("span")].map((letter) => getComputedStyle(letter).opacity),
    };
  });

test.describe("로그인 화면 로고", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" }, storageState: NO_SESSION });

  test("들어오면 시작 화면과 같은 순서와 시간으로 한 번만 그린다", async ({ page }) => {
    // Arrange
    await holdLogo(page);

    // Act
    await page.goto("/login");

    // Assert
    const steps = await readDrawSteps(getLoginLogo(page));
    const letters = steps.filter((step) => step.name === "logo-letter-in");
    expect(steps.every((step) => step.iterations === 1)).toBe(true);
    expect(steps.filter((step) => step.name === "logo-heart-draw")).toEqual([
      { name: "logo-heart-draw", start: 0, end: HEART_END_MS, iterations: 1 },
      { name: "logo-heart-draw", start: 0, end: HEART_END_MS, iterations: 1 },
    ]);
    expect(steps.find((step) => step.name === "logo-line-in")).toMatchObject({ start: LINE_START_MS, end: LINE_START_MS + 120 });
    expect(letters).toHaveLength(await getLoginLogo(page).locator("span").count());
    expect(letters[0]?.start).toBe(LETTERS_START_MS);
    expect(letters.at(-1)?.end).toBeCloseTo(LETTERS_END_MS, 0);
  });

  test("다 그린 뒤에는 사라지지 않고 완성된 채 남는다", async ({ page }) => {
    // Arrange
    await page.goto("/login");
    const logo = getLoginLogo(page);

    // Act
    await waitForDrawn(logo);

    // Assert: 시작 화면처럼 사라지는 단계가 있다면 로고나 그 바깥 요소에 아직 끝나지 않은 움직임이 남는다
    const pendingAnimations = await logo.evaluate((element) =>
      document.getAnimations().filter((animation) => {
        const target = animation.effect instanceof KeyframeEffect ? animation.effect.target : null;
        return target !== null && (target.contains(element) || element.contains(target)) && animation.playState !== "finished";
      }),
    );
    expect(pendingAnimations).toHaveLength(0);
    await expect(logo).toBeVisible();
    await expect(logo).toHaveCSS("opacity", "1");
    const look = await readFinishedLook(logo);
    expect(look.dashOffsets.every((offset) => Number.parseFloat(offset) === 0)).toBe(true);
    expect(look.isLineFullWidth).toBe(true);
    expect(look.letterOpacities.every((opacity) => opacity === "1")).toBe(true);
  });

  test("글자마다 나눠 그려도 화면 읽기 프로그램에는 문구를 한 덩어리로 읽어 준다", async ({ page }) => {
    // Act
    await page.goto("/login");

    // Assert: 글자마다 나눈 요소를 그대로 두면 아이폰 VoiceOver가 한 글자씩 읽는다
    await expect(getLoginLogo(page).getByRole("img", { name: formatSinceLabel(ANNIVERSARY_DATE) })).toBeVisible();
  });

  test("그리는 동안에도 입력 칸을 누르고 쓸 수 있다", async ({ page }) => {
    // Arrange
    await holdLogo(page);
    await page.goto("/login", { waitUntil: "networkidle" });
    const emailInput = page.getByLabel("이메일");

    // Act
    await emailInput.click();
    await emailInput.pressSequentially("love@example.com");

    // Assert
    await expect(emailInput).toBeFocused();
    await expect(emailInput).toHaveValue("love@example.com");
    const playStates = await getLoginLogo(page).evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => animation.playState));
    expect(playStates.length).toBeGreaterThan(0);
    expect(playStates.every((state) => state === "paused")).toBe(true);
  });

  test("비밀번호가 틀려 다시 입력해도 로고를 다시 그리지 않는다", async ({ page }) => {
    // Arrange
    await page.goto("/login", { waitUntil: "networkidle" });
    const logo = getLoginLogo(page);
    await waitForDrawn(logo);

    // Act
    await page.getByLabel("이메일").fill(`wrong-${randomUUID()}@example.com`);
    await page.getByLabel("비밀번호").fill(randomUUID());
    await page.getByRole("button", { name: "로그인" }).click();
    await expect(page.locator("main").getByRole("alert")).toContainText("맞지 않아요");

    // Assert: 로고가 새로 그려졌다면 다시 시작한 움직임이 남는다
    const playStates = await logo.evaluate((element) => element.getAnimations({ subtree: true }).map((animation) => animation.playState));
    expect(playStates.every((state) => state === "finished")).toBe(true);
    await expect(page.getByLabel("비밀번호")).toHaveValue("");
  });

  test("앱 안에서 로그아웃해 들어와도 로고를 그린다", async ({ page }) => {
    // Arrange
    const password = randomUUID();
    const { email, remove } = await createDisposableMember(password);
    await page.goto("/login", { waitUntil: "networkidle" });

    try {
      await page.getByLabel("이메일").fill(email);
      await page.getByLabel("비밀번호").fill(password);
      await page.getByRole("button", { name: "로그인" }).click();
      await page.waitForURL((url) => url.pathname === "/");
      await page.goto("/settings", { waitUntil: "networkidle" });
      await holdLogo(page);

      // Act
      await page.getByRole("button", { name: "로그아웃" }).click();
      await page.waitForURL(/\/login/);

      // Assert
      const steps = await readDrawSteps(getLoginLogo(page));
      expect(steps.map((step) => step.name)).toContain("logo-heart-draw");
      await expect(page.locator("[data-startup-splash]")).toBeHidden();
    } finally {
      await remove();
    }
  });

  test.describe("움직임 줄이기 설정이면", () => {
    test.use({ contextOptions: { reducedMotion: "reduce" } });

    test("움직이지 않고 완성된 로고를 보여 준다", async ({ page }) => {
      // Act
      await page.goto("/login");

      // Assert
      const logo = getLoginLogo(page);
      await expect(logo).toBeVisible();
      expect(await readDrawSteps(logo)).toEqual([]);
      const look = await readFinishedLook(logo);
      expect(look.dashOffsets.every((offset) => Number.parseFloat(offset) === 0)).toBe(true);
      expect(look.isLineFullWidth).toBe(true);
      expect(look.letterOpacities.every((opacity) => opacity === "1")).toBe(true);
    });
  });
});
