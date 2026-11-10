import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { E2E_MEMBER, E2E_TODOS } from "./support/constants";
import { createDisposableEvent, createNonMemberAccount, deleteTodosByContent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getSaveButton, pickPhoto } from "./support/actions";
import { createTestName } from "./support/names";

const [, , TODO] = E2E_TODOS;

const getDialog = (page: Page): Locator => page.getByRole("dialog", { name: "다시 로그인해 주세요" });

/** 앱을 오래 켜 둔 사이 세션이 끊긴 상태를 만든다 */
const dropSession = (page: Page): Promise<void> => page.context().clearCookies();

const getMemberPassword = (): string => {
  const password = process.env.E2E_MEMBER_PASSWORD;
  if (!password) throw new Error("E2E_MEMBER_PASSWORD가 없습니다. global-setup이 돌았는지 확인해 주세요.");
  return password;
};

const signInAgain = async (page: Page, password: string, email: string = E2E_MEMBER.email): Promise<void> => {
  const dialog = getDialog(page);
  await dialog.getByLabel("이메일").fill(email);
  await dialog.getByLabel("비밀번호").fill(password);
  await dialog.getByRole("button", { name: "로그인" }).click();
};

test.describe("쓰는 중에 로그인이 풀리면", () => {
  test("하고 싶은 것을 저장할 때 다시 로그인하면 적은 내용이 남아 있고 그대로 저장된다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 세션", testInfo);

    try {
      await openScreen(page, "/todos/new", getSaveButton(page));
      await page.getByRole("textbox").fill(content);
      await dropSession(page);

      // Act: 먼저 틀린 비밀번호로 시도한다
      await getSaveButton(page).click();
      await expect(getDialog(page)).toBeVisible();
      await signInAgain(page, "wrong-password");
      await expect(getDialog(page).getByRole("alert")).toContainText("맞지 않아요");
      await signInAgain(page, getMemberPassword());
      await expect(getDialog(page)).toBeHidden();

      // Assert
      await expect(page.locator("main").getByRole("textbox")).toHaveValue(content);
      await getSaveButton(page).click();
      await page.waitForURL("**/todos");
      await expect(page.getByText(content).first()).toBeVisible();
    } finally {
      await deleteTodosByContent(content);
    }
  });

  test("일정을 저장할 때 창이 나오고 닫아도 적은 내용이 남아 있다", async ({ page }) => {
    await openScreen(page, "/events/new", page.locator("#event-memo"));
    await page.locator("#event-title").fill("E2E 저장하지 않는 일정");
    await dropSession(page);

    await getSaveButton(page).click();
    await expect(getDialog(page)).toBeVisible();
    await getDialog(page).getByRole("button", { name: "닫기" }).click();

    await expect(getDialog(page)).toBeHidden();
    await expect(page.locator("#event-title")).toHaveValue("E2E 저장하지 않는 일정");
    await expect(page.locator("main").getByRole("alert")).toContainText("저장하지 못했어요");
  });

  test("사진이 있는 기록을 저장할 때 다시 로그인하면 고른 사진이 남아 있다", async ({ page }) => {
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await pickPhoto(page, 1);
    await page.locator("main").getByLabel("제목").fill("E2E 저장하지 않는 기록");
    await dropSession(page);

    await getSaveButton(page).click();
    await expect(getDialog(page)).toBeVisible();
    await signInAgain(page, getMemberPassword());

    await expect(getDialog(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "1번째 사진 빼기" })).toBeVisible();
    await expect(page.locator("main").getByLabel("제목")).toHaveValue("E2E 저장하지 않는 기록");
  });

  test("목록에서 순서를 바꿀 때도 창이 나온다", async ({ page }) => {
    await openScreen(page, "/todos", page.getByText(TODO.content));
    await dropSession(page);

    await page.getByRole("button", { name: /아래로/ }).first().click();

    await expect(getDialog(page)).toBeVisible();
    // 실패 뒤 목록을 다시 불러오면 로그인 화면으로 넘어가, 창에서 로그인해도 그 화면에 남는다
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/todos");
    await expect(page.getByText(TODO.content)).toBeVisible();

    await signInAgain(page, getMemberPassword());
    await expect(getDialog(page)).toBeHidden();
    await page.getByRole("button", { name: /아래로/ }).first().click();
    await page.waitForLoadState("networkidle");
    expect(new URL(page.url()).pathname).toBe("/todos");
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
  });

  test("삭제 확인 창에서 지울 때 그 위에 창이 나온다", async ({ page }, testInfo) => {
    // Arrange: 지우기가 성공하면 공유 시드 일정이 사라져 다른 테스트가 흔들리므로 이 테스트만 쓰는 일정을 지운다.
    // 오늘 일정을 세는 홈·캘린더 테스트에 끼지 않게 지난 날에 둔다
    const id = randomUUID();
    const deleteEvent = await createDisposableEvent({ id, title: createTestName("E2E 세션 지우기", testInfo), date: "2015-03-10" });

    try {
      await openScreen(page, `/events/${id}/edit`, page.locator("#event-memo"));
      await dropSession(page);

      // Act
      await page.getByRole("button", { name: "삭제" }).click();
      await page.getByRole("dialog", { name: "이 일정을 지울까요?" }).getByRole("button", { name: "삭제" }).click();

      // Assert
      await expect(getDialog(page)).toBeVisible();
    } finally {
      await deleteEvent();
    }
  });
});

test("허용목록 밖 계정으로 다시 로그인하면 알리고 로그아웃한다", async ({ page }) => {
  // Arrange
  const email = `e2e-outsider-${randomUUID()}@example.com`;
  const password = randomUUID();
  const deleteAccount = await createNonMemberAccount(email, password);
  try {
    await openScreen(page, "/todos/new", getSaveButton(page));
    await page.getByRole("textbox").fill("E2E 저장되지 않는 항목");
    await dropSession(page);
    await getSaveButton(page).click();

    // Act
    await expect(getDialog(page)).toBeVisible();
    await signInAgain(page, password, email);

    // Assert
    await expect(getDialog(page).getByRole("alert")).toContainText("허용된 계정이 아닙니다");
    const cookies = await page.context().cookies();
    expect(cookies.filter(({ name }) => name.includes("auth-token"))).toEqual([]);
  } finally {
    await deleteAccount();
  }
});

test.describe("로그인 문제가 아니면", () => {
  for (const { name, handle } of [
    { name: "인터넷이 끊겼을 때", handle: { abort: true } },
    { name: "서버 오류일 때", handle: { abort: false } },
  ]) {
    test(`${name}는 다시 로그인 창 없이 저장 실패만 알린다`, async ({ page }) => {
      await openScreen(page, "/todos/new", getSaveButton(page));
      await page.getByRole("textbox").fill("E2E 저장되지 않는 항목");
      await page.route("**/rest/v1/todos**", (route) => (handle.abort ? route.abort() : route.fulfill({ status: 500, json: {} })));

      await getSaveButton(page).click();

      // 끊긴 요청과 5xx는 서버가 저장했는지 알 수 없어 그렇게 알린다(#161)
      await expect(page.locator("main").getByRole("alert")).toContainText("저장됐는지 확인하지 못했어요");
      await expect(getDialog(page)).toBeHidden();
    });
  }

  test("세션은 있는데 401이 오면 창을 띄우지 않는다", async ({ page }) => {
    await openScreen(page, "/todos/new", getSaveButton(page));
    await page.getByRole("textbox").fill("E2E 저장되지 않는 항목");
    await page.route("**/rest/v1/todos**", (route) => route.fulfill({ status: 401, json: { code: "42501", message: "x" } }));
    const checked = page.waitForResponse("**/auth/v1/user");

    await getSaveButton(page).click();
    await checked;

    await expect(page.locator("main").getByRole("alert")).toContainText("저장하지 못했어요");
    await expect(getDialog(page)).toBeHidden();
  });
});
