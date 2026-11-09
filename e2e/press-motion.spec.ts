import type { Locator, Page } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { readAnimations, recordAnimations, waitForPaint } from "./support/motion";
import { expect, openScreen, test } from "./support/test";
import { getSubmitButton, getTab } from "./support/actions";

const getScale = (target: Locator): Promise<string> => target.evaluate((element) => getComputedStyle(element).scale);
const getOpacity = (target: Locator): Promise<string> => target.evaluate((element) => getComputedStyle(element).opacity);

/** 손가락을 대고 있는 상태를 만든다. 뗀 뒤 이동하지 않게 바깥으로 옮겨 놓는다 */
const pressAndHold = async (page: Page, target: Locator): Promise<() => Promise<void>> => {
  const box = await target.boundingBox();
  if (!box) throw new Error("누를 대상이 화면에 없습니다");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  return async () => {
    await page.mouse.move(1, 1);
    await page.mouse.up();
  };
};

/** 가장자리에 손을 대고 대상이 다 줄어든 뒤에 뗀다 */
const pressEdgeUntilShrunk = async (page: Page, target: Locator): Promise<void> => {
  const box = await target.boundingBox();
  if (!box) throw new Error("누를 대상이 화면에 없습니다");
  await page.mouse.move(box.x + 1, box.y + box.height / 2);
  await page.mouse.down();
  await expect.poll(() => getScale(target)).not.toBe("none");
  await page.waitForTimeout(150);
  await page.mouse.up();
};

test.describe("움직임을 켠 기기에서", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("넓은 버튼을 누르면 96%로 줄었다가 떼면 돌아온다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/todos/new", page.locator("#todo-content"));
    const button = getSubmitButton(page);

    // Act
    const release = await pressAndHold(page, button);

    // Assert
    await expect.poll(() => getScale(button)).toBe("0.96");
    await release();
    await expect.poll(() => getScale(button)).toBe("none");
  });

  test("아이콘 버튼을 누르면 85%로 줄고 연해진다", async ({ page }) => {
    // Arrange
    await openScreen(page, TODOS_PATH, page.locator("main").locator("visible=true"));
    const button = page.getByRole("link", { name: "하고 싶은 것 추가" }).locator("visible=true");

    // Act
    const release = await pressAndHold(page, button);

    // Assert
    await expect.poll(() => getScale(button)).toBe("0.85");
    await expect.poll(() => getOpacity(button)).toBe("0.5");
    await release();
  });

  test("줄어드는 버튼의 가장자리를 눌러도 눌린 것으로 친다", async ({ page }) => {
    // Arrange
    await openScreen(page, TODOS_PATH, page.locator("main").locator("visible=true"));

    // Act
    await pressEdgeUntilShrunk(page, page.getByRole("link", { name: "하고 싶은 것 추가" }).locator("visible=true"));

    // Assert
    await page.waitForURL("**/todos/new");
  });

  test("줄어드는 홈 카드의 가장자리를 눌러도 눌린 것으로 친다", async ({ page }) => {
    // Arrange
    const card = page.getByRole("region", { name: "하고 싶은 것" });
    await openScreen(page, "/", card);

    // Act
    await pressEdgeUntilShrunk(page, card);

    // Assert
    await page.waitForURL(`**${TODOS_PATH}**`);
  });

  test("홈 카드의 링크를 누르면 카드 전체가 97%로 줄어든다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/", page.getByRole("region", { name: "하고 싶은 것" }));
    const card = page.getByRole("region", { name: "하고 싶은 것" });

    // Act
    const release = await pressAndHold(page, card);

    // Assert
    await expect.poll(() => getScale(card)).toBe("0.97");
    await release();
  });

  test("하단 탭을 고를 때만 아이콘이 튕기고 뒤로 돌아올 때는 튕기지 않는다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/", getTab(page, TODOS_PATH));
    await recordAnimations(page);

    // Act
    await getTab(page, TODOS_PATH).tap();
    await page.waitForURL(`**${TODOS_PATH}`);

    // Assert
    await expect.poll(() => readAnimations(page)).toEqual(expect.arrayContaining(["tab-pop", "tab-color-in", "tab-color-out"]));

    // Arrange
    await page.getByRole("link", { name: "하고 싶은 것 추가" }).locator("visible=true").tap();
    await page.waitForURL("**/todos/new");
    await recordAnimations(page);

    // Act
    await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
    await page.waitForURL(`**${TODOS_PATH}`);
    await expect(getTab(page, TODOS_PATH)).toBeVisible();
    await waitForPaint(page);

    // Assert
    expect(await readAnimations(page)).not.toContain("tab-pop");
  });

  test("탭을 새 창으로 열면 그 탭으로 나중에 옮겨 가도 튕기지 않는다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/", getTab(page, TODOS_PATH));
    await recordAnimations(page);
    await getTab(page, TODOS_PATH).click({ modifiers: ["Control"] });

    // Act: 탭이 아니라 홈 카드로 옮겨 간다
    await page.bringToFront();
    await page.getByRole("region", { name: "하고 싶은 것" }).getByRole("link").first().click();
    await page.waitForURL(`**${TODOS_PATH}**`);
    await expect(getTab(page, TODOS_PATH)).toBeVisible();
    await waitForPaint(page);

    // Assert
    expect(await readAnimations(page)).not.toContain("tab-pop");
  });
});

test.describe("동작 줄이기를 켠 기기에서", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("버튼을 눌러도 줄어들지 않고 탭을 골라도 움직이지 않는다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/", getTab(page, TODOS_PATH));
    await recordAnimations(page);
    const settings = page.getByRole("link", { name: "설정" }).locator("visible=true");

    // Act
    const release = await pressAndHold(page, settings);

    // Assert
    expect(await getScale(settings)).toBe("none");
    await release();

    // Act
    await getTab(page, TODOS_PATH).tap();
    await page.waitForURL(`**${TODOS_PATH}`);
    await expect(getTab(page, TODOS_PATH)).toBeVisible();
    await waitForPaint(page);

    // Assert: 화면 전환은 길이 0으로 따로 끈다(page-transition.test.ts)
    expect((await readAnimations(page)).filter((name) => name.startsWith("tab-"))).toEqual([]);
  });
});
