import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getSaveButton } from "./support/actions";

const getDeleteButton = (page: Page): Locator => page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true");
const getSessionDialog = (page: Page): Locator => page.getByRole("dialog", { name: "다시 로그인해 주세요" });

/** 임시 할 일의 고치기 화면을 연다 */
const openDisposableTodo = async (page: Page, label: string, name: string): Promise<() => Promise<void>> => {
  const id = randomUUID();
  const deleteTodo = await createDisposableTodo({ id, content: `${label} ${name} ${id.slice(0, 8)}` });
  await openScreen(page, `/todos/${id}/edit`, getDeleteButton(page));
  return deleteTodo;
};

test.describe("삭제 확인 창", () => {
  test("열면 제목과 설명을 읽을 수 있고 취소하면 닫히며 초점이 삭제 버튼으로 돌아간다", async ({ page }, testInfo) => {
    // Arrange
    const deleteTodo = await openDisposableTodo(page, "창 취소", testInfo.project.name);

    try {
      // Act
      await getDeleteButton(page).click();
      const dialog = page.getByRole("dialog", { name: "이 항목을 지울까요?" });
      await expect(dialog).toHaveAccessibleDescription(/지워져요/);
      await dialog.getByRole("button", { name: "취소" }).click();

      // Assert
      await expect(dialog).toBeHidden();
      await expect(getDeleteButton(page)).toBeFocused();
    } finally {
      await deleteTodo();
    }
  });

  test("Esc를 누르면 닫힌다", async ({ page }, testInfo) => {
    // Arrange
    const deleteTodo = await openDisposableTodo(page, "창 Esc", testInfo.project.name);

    try {
      // Act
      await getDeleteButton(page).click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.keyboard.press("Escape");

      // Assert
      await expect(page.getByRole("dialog")).toBeHidden();
    } finally {
      await deleteTodo();
    }
  });

  test("지우는 중에는 Esc를 눌러도 닫히지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const deleteTodo = await openDisposableTodo(page, "지우는 중 Esc", testInfo.project.name);
    let releaseRequest = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/rest/v1/todos*", async (route) => {
      if (route.request().method() !== "DELETE") return route.continue();
      await held;
      return route.abort();
    });

    try {
      // Act
      await getDeleteButton(page).click();
      await page.getByRole("dialog").getByRole("button", { name: "삭제", exact: true }).click();
      await expect(page.getByRole("dialog").getByRole("button", { name: "지우는 중…" })).toBeDisabled();
      await page.keyboard.press("Escape");

      // Assert: 닫혔다면 아래 실패 문구를 볼 수 없다
      await expect(page.getByRole("dialog")).toBeVisible();
      releaseRequest();
      await expect(page.getByRole("dialog").getByRole("alert")).toContainText("지우지 못했어요");
    } finally {
      releaseRequest();
      await deleteTodo();
    }
  });
});

test.describe("커플 사진 메뉴", () => {
  test("사진 지우기를 누르면 확인 단계로 바뀌고, 취소한 뒤 다시 열면 처음 메뉴가 나온다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/", page.getByRole("button", { name: "커플 사진 바꾸기" }));

    // Act
    await page.getByRole("button", { name: "커플 사진 바꾸기" }).click();
    await expect(page.getByRole("dialog", { name: "커플 사진", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "사진 지우기" }).click();

    // Assert: 누른 버튼이 사라지므로 초점이 확인 단계의 취소로 옮겨 간다
    const confirm = page.getByRole("dialog", { name: "커플 사진을 지울까요?" });
    await expect(confirm).toHaveAccessibleDescription(/되돌릴 수 없어요/);
    const cancel = confirm.getByRole("button", { name: "취소" });
    await expect(cancel).toBeFocused();

    // Act
    await cancel.click();
    await expect(confirm).toBeHidden();
    await page.getByRole("button", { name: "커플 사진 바꾸기" }).click();

    // Assert
    const menu = page.getByRole("dialog", { name: "커플 사진", exact: true });
    await expect(menu).toBeVisible();
    await expect(menu.getByRole("button", { name: "사진 바꾸기" })).toBeVisible();
  });
});

test.describe("다시 로그인 창", () => {
  test("로그인을 확인하는 중에는 Esc를 눌러도 닫히지 않고, 끝난 뒤에는 닫힌다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/todos/new", getSaveButton(page));
    await page.getByRole("textbox").fill("E2E 저장하지 않는 창 확인");
    await page.context().clearCookies();
    await getSaveButton(page).click();
    await expect(getSessionDialog(page)).toBeVisible();
    let releaseRequest = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/auth/v1/token*", async (route) => {
      await held;
      return route.abort();
    });

    try {
      // Act
      await getSessionDialog(page).getByLabel("이메일").fill("nobody@example.com");
      await getSessionDialog(page).getByLabel("비밀번호").fill("wrong-password");
      await getSessionDialog(page).getByRole("button", { name: "로그인" }).click();
      await expect(getSessionDialog(page).getByRole("button", { name: "확인 중…" })).toBeDisabled();
      await page.keyboard.press("Escape");

      // Assert: 닫혔다면 아래 실패 문구를 볼 수 없다
      await expect(getSessionDialog(page)).toBeVisible();
      releaseRequest();
      await expect(getSessionDialog(page).getByRole("alert")).toBeVisible();

      // Act
      await page.keyboard.press("Escape");

      // Assert
      await expect(getSessionDialog(page)).toBeHidden();
    } finally {
      releaseRequest();
    }
  });
});
