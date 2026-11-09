import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { SETTINGS_PASSWORD_PATH } from "@/lib/auth/paths";
import { createDisposableMember } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { signIn, signInToHome } from "./support/actions";

const NEW_PASSWORD = "e2e-new-password-1234";

// 전용 계정의 비밀번호를 바꾸면 나란히 도는 다른 테스트의 로그인이 끊기므로 테스트마다 임시 계정을 쓴다
test.use({ storageState: { cookies: [], origins: [] } });

const openPasswordScreen = async (page: Page, email: string, password: string): Promise<void> => {
  await signInToHome(page, email, password);
  await openScreen(page, SETTINGS_PASSWORD_PATH, page.getByLabel("현재 비밀번호"));
};

const fillPasswords = async (page: Page, { current, next, confirm = next }: { current: string; next: string; confirm?: string }): Promise<void> => {
  await page.getByLabel("현재 비밀번호").fill(current);
  await page.getByLabel("새 비밀번호", { exact: true }).fill(next);
  await page.getByLabel("새 비밀번호 확인").fill(confirm);
};

const getSubmitButton = (page: Page) => page.getByRole("button", { name: "비밀번호 바꾸기" });

test.describe("비밀번호 변경", () => {
  let email: string;
  let password: string;
  let removeMember: () => Promise<void>;

  test.beforeEach(async () => {
    password = randomUUID();
    ({ email, remove: removeMember } = await createDisposableMember(password));
  });

  test.afterEach(async () => {
    await removeMember();
  });

  test("설정에서 들어가 바꾸면 설정으로 돌아오고 새 비밀번호로만 다시 로그인할 수 있다", async ({ page }) => {
    // Arrange
    await signInToHome(page, email, password);
    await openScreen(page, "/settings", page.getByRole("link", { name: "비밀번호 변경" }));
    await page.getByRole("link", { name: "비밀번호 변경" }).click();
    await page.getByLabel("현재 비밀번호").waitFor();

    // Act
    await fillPasswords(page, { current: password, next: NEW_PASSWORD });
    await getSubmitButton(page).click();

    // Assert: 로그인은 유지된 채 설정으로 돌아온다
    await page.waitForURL("**/settings");
    await expect(page.getByRole("status").filter({ hasText: "비밀번호를 바꿨어요" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("link", { name: "비밀번호 변경" })).toBeVisible();

    await page.getByRole("button", { name: "로그아웃" }).click();
    await page.waitForURL("**/login");
    await signIn(page, email, password);
    await expect(page.locator("main").getByRole("alert")).toContainText("맞지 않아요");
    await signInToHome(page, email, NEW_PASSWORD);
  });

  test("현재 비밀번호가 틀리면 바뀌지 않고 로그인도 유지된다", async ({ page }) => {
    // Arrange
    await openPasswordScreen(page, email, password);

    // Act
    await fillPasswords(page, { current: "wrong-current-password", next: NEW_PASSWORD });
    await getSubmitButton(page).click();

    // Assert: 틀린 칸만 비우고 새 비밀번호는 남긴다
    await expect(page.locator("main").getByRole("alert")).toContainText("현재 비밀번호가 맞지 않아요");
    await expect(page.getByLabel("현재 비밀번호")).toHaveValue("");
    await expect(page.getByLabel("새 비밀번호", { exact: true })).toHaveValue(NEW_PASSWORD);

    // 다시 적기 시작하면 지난 안내를 지운다
    await page.getByLabel("현재 비밀번호").fill("다시 적는 중");
    await expect(page.locator("main").getByRole("alert")).toBeHidden();

    await page.reload();
    await expect(page.getByLabel("현재 비밀번호")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(SETTINGS_PASSWORD_PATH);

    // 틀린 뒤에 맞게 적으면 바뀐다
    await fillPasswords(page, { current: password, next: NEW_PASSWORD });
    await getSubmitButton(page).click();
    await page.waitForURL("**/settings");
  });

  test("12자보다 짧거나 확인 칸이 다르면 서버에 보내지 않고 안내한다", async ({ page }) => {
    // Arrange
    await openPasswordScreen(page, email, password);
    const authRequests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/auth/v1/")) authRequests.push(request.url());
    });

    // Act & Assert
    await fillPasswords(page, { current: password, next: "short-pass" });
    await getSubmitButton(page).click();
    await expect(page.getByText("12자 이상 적어 주세요")).toBeVisible();

    await fillPasswords(page, { current: password, next: NEW_PASSWORD, confirm: `${NEW_PASSWORD}x` });
    await getSubmitButton(page).click();
    await expect(page.getByText("새 비밀번호와 같게 적어 주세요")).toBeVisible();

    // 새 비밀번호 칸을 고쳐도 확인 칸과의 비교가 달라지므로 안내를 지운다
    await page.getByLabel("새 비밀번호", { exact: true }).fill(`${NEW_PASSWORD}x`);
    await expect(page.getByText("새 비밀번호와 같게 적어 주세요")).toBeHidden();

    expect(authRequests).toEqual([]);
    expect(new URL(page.url()).pathname).toBe(SETTINGS_PASSWORD_PATH);
  });

  test("적다가 화면을 떠나면 숨겨진 칸에 비밀번호가 남지 않고 다시 열면 비어 있다", async ({ page }) => {
    // Arrange
    await signInToHome(page, email, password);
    await openScreen(page, "/settings", page.getByRole("link", { name: "비밀번호 변경" }));
    await page.getByRole("link", { name: "비밀번호 변경" }).click();
    await page.getByLabel("현재 비밀번호").waitFor();
    await fillPasswords(page, { current: password, next: NEW_PASSWORD });

    // Act
    await page.getByRole("link", { name: "뒤로" }).click();
    await page.waitForURL("**/settings");

    // Assert: 화면을 숨겨 두는 동안에도 DOM에 값이 없어야 한다
    await expect
      .poll(() => page.locator('input[type="password"]').evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value).join("")))
      .toBe("");

    await page.getByRole("link", { name: "비밀번호 변경" }).click();
    await expect(page.getByLabel("현재 비밀번호")).toHaveValue("");
  });

  test("화면에 비밀번호 관리자가 계정을 알아볼 칸이 있다", async ({ page }) => {
    await openPasswordScreen(page, email, password);

    await expect(page.locator('input[autocomplete="username"]')).toHaveValue(email);
    await expect(page.getByLabel("현재 비밀번호")).toHaveAttribute("autocomplete", "current-password");
    await expect(page.getByLabel("새 비밀번호", { exact: true })).toHaveAttribute("autocomplete", "new-password");
    await expect(page.getByLabel("새 비밀번호 확인")).toHaveAttribute("autocomplete", "new-password");
  });
});
