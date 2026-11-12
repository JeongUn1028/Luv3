import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { TAG_MAX_LENGTH } from "@/lib/dates/form";
import { E2E_MEMBER, E2E_TODOS } from "./support/constants";
import { createDisposableRecord, createDisposableTodo, setRecordSearchFields } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getSaveButton, getSubmitButton, getTab, pickPhoto } from "./support/actions";
import { createTestName } from "./support/names";

// 입력 오류·실패 안내를 어디에 보이고 언제 지우는지 고정한다(#259)

const [TODO] = E2E_TODOS;
const FIX_FIELDS_NOTICE = "입력한 내용을 확인해 주세요.";
/** 띄어쓰기가 없어 줄을 바꿀 자리가 없는 글자. 두 기기 폭(393·402px)보다 훨씬 길다 */
const UNBROKEN_TEXT = "a".repeat(80);

const getFormAlert = (page: Page): Locator => page.locator("main form").getByRole("alert").locator("visible=true");

/** 요소의 글자가 자기 폭을 넘쳐 옆으로 삐져나간 만큼(px) */
const getHorizontalOverflow = (locator: Locator): Promise<number> => locator.evaluate((element) => element.scrollWidth - element.clientWidth);

test.describe("저장할 때 입력 오류가 있으면", () => {
  test("기록 폼은 첫 오류 칸으로 초점과 화면을 옮기고, 오류를 모두 고치면 폼 안내를 지운다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/dates/new", page.locator("#memo").locator("visible=true"));
    const photoButton = page.getByRole("button", { name: "새 모음 만들기 · 사진 고르기" }).locator("visible=true");
    const titleField = page.locator("#title").locator("visible=true");

    // Act: 사진도 제목도 없이 저장한다
    await getSubmitButton(page).tap();

    // Assert: 폼 맨 위의 새 모음 만들기가 첫 오류 칸이다
    await expect(photoButton).toBeFocused();
    await expect(photoButton).toHaveAccessibleDescription("사진을 한 장 이상 골라 주세요.");
    await expect(getFormAlert(page)).toHaveText(FIX_FIELDS_NOTICE);

    // Arrange: 사진을 여러 장 골라 제목 칸을 저장 버튼에서 먼 위쪽으로 밀어낸다
    for (const order of [1, 2, 3, 4]) await pickPhoto(page, order);
    // 사진 오류는 고쳤지만 제목 오류가 남아 있어 안내도 남는다
    await expect(getFormAlert(page)).toHaveText(FIX_FIELDS_NOTICE);

    // Act
    await getSubmitButton(page).tap();

    // Assert
    await expect(titleField).toBeFocused();
    await expect(titleField).toBeInViewport({ ratio: 1 });
    await expect(getFormAlert(page)).toHaveText(FIX_FIELDS_NOTICE);

    // Act: 남은 오류 칸을 고친다
    await titleField.fill("오류를 고친 제목");

    // Assert: 저장을 다시 누르기 전에도 안내가 사라진다
    await expect(getFormAlert(page)).toBeHidden();

    // Act: 저장을 누르지 않은 채 새 칸 오류(너무 긴 태그)를 만든다
    await page.getByRole("button", { name: "태그 추가" }).locator("visible=true").click();
    await page.locator("#tag-input").locator("visible=true").fill("가".repeat(TAG_MAX_LENGTH + 1));
    await page.getByRole("button", { name: "추가", exact: true }).locator("visible=true").click();

    // Assert: 칸 오류는 보이지만, 지난 저장의 폼 안내는 다시 나타나지 않는다
    await expect(page.locator("#tag-error").locator("visible=true")).toBeVisible();
    await expect(getFormAlert(page)).toBeHidden();
  });

  test("일정 폼도 첫 오류 칸으로 초점을 옮기고, 오류를 고치면 폼 안내를 지운다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/events/new", page.locator("#event-title").locator("visible=true"));
    const titleField = page.locator("#event-title").locator("visible=true");

    // Act
    await getSubmitButton(page).tap();

    // Assert
    await expect(titleField).toBeFocused();
    await expect(getFormAlert(page)).toHaveText(FIX_FIELDS_NOTICE);

    // Act
    await titleField.fill("오류를 고친 일정");

    // Assert
    await expect(getFormAlert(page)).toBeHidden();
  });
});

test.describe("지난 실패 문구는 다른 화면에 다녀오면 지운다", () => {
  test("하고 싶은 것 목록의 저장 실패", async ({ page }) => {
    // Arrange: 저장 요청만 실패시켜 함께 쓰는 항목은 바뀌지 않는다
    await openScreen(page, "/todos", page.getByText(TODO.content));
    await page.route("**/rest/v1/todos*", (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 500, body: "{}" }) : route.fallback()));
    await page.getByRole("checkbox", { name: `${TODO.content} 완료` }).click();
    const alert = page.locator("main").getByRole("alert").filter({ hasText: "저장하지 못했어요" });
    await expect(alert).toBeVisible();
    await page.unroute("**/rest/v1/todos*");

    // Act
    await getTab(page, "/").click();
    await page.waitForURL((url) => url.pathname === "/");
    await getTab(page, "/todos").click();
    await page.waitForURL("**/todos");

    // Assert: 홈의 하고 싶은 것 칸에도 같은 글자가 있어 목록의 링크로 찾는다
    await expect(page.locator("main").getByRole("link", { name: TODO.content }).locator("visible=true")).toBeVisible();
    await expect(alert).toBeHidden();
  });

  test("커플 사진의 파일 안내", async ({ page }) => {
    // Arrange: 사진이 아닌 파일은 올리지 않고 안내만 한다
    await openScreen(page, "/", page.getByRole("button", { name: "커플 사진 바꾸기" }));
    await page.getByLabel("커플 사진 고르기").setInputFiles({ name: "note.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") });
    const alert = page.getByRole("alert").filter({ hasText: "사진 파일만 올릴 수 있어요." });
    await expect(alert).toBeVisible();

    // Act
    await getTab(page, "/records").click();
    await page.waitForURL("**/records");
    await getTab(page, "/").click();
    await page.waitForURL((url) => url.pathname === "/");

    // Assert
    await expect(page.getByRole("button", { name: "커플 사진 바꾸기" })).toBeVisible();
    await expect(alert).toBeHidden();
  });

  test("댓글을 남기지 못한 안내", async ({ page }, testInfo) => {
    // Arrange: 남기는 요청만 끊어 댓글은 생기지 않는다(#261)
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 지난 댓글 실패", testInfo) });
    const commentInput = page.locator("#comment-content").locator("visible=true");

    try {
      await openScreen(page, `/dates/${recordId}`, commentInput);
      await page.route("**/rest/v1/comments*", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
      await commentInput.fill("못 남긴 댓글");
      await page.getByRole("button", { name: /^남기/ }).locator("visible=true").click();
      const alert = page.getByRole("alert").filter({ hasText: "댓글을 남기지 못했어요." });
      await expect(alert).toBeVisible();
      await page.unroute("**/rest/v1/comments*");

      // Act: 고치기 화면에 다녀온다(상세에는 하단 탭이 없다)
      await page.getByRole("link", { name: "수정" }).locator("visible=true").click();
      await page.waitForURL(`**/dates/${recordId}/edit`);
      await page.goBack();
      await page.waitForURL(`**/dates/${recordId}`);

      // Assert: 쓴 글은 남기고 지난 실패 안내만 지운다
      await expect(commentInput).toHaveValue("못 남긴 댓글");
      await expect(alert).toBeHidden();
    } finally {
      await deleteRecord();
    }
  });

  test("닉네임을 저장하지 못한 안내", async ({ page }) => {
    // Arrange: 저장 요청만 실패시켜 함께 쓰는 닉네임은 바뀌지 않는다(#261)
    const nicknameInput = page.getByLabel("닉네임", { exact: true }).locator("visible=true");
    await openScreen(page, "/settings", page.getByRole("link", { name: /^닉네임/ }));
    await page.getByRole("link", { name: /^닉네임/ }).click();
    await nicknameInput.waitFor();
    await page.route("**/rest/v1/members*", (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: {} }) : route.fallback()));
    await nicknameInput.fill("못바꾼이름");
    await getSaveButton(page).click();
    const alert = page.locator("main").getByRole("alert").filter({ hasText: "저장하지 못했어요" });
    await expect(alert).toBeVisible();
    await page.unroute("**/rest/v1/members*");

    // Act: 설정에 다녀온다
    await page.goBack();
    await page.waitForURL("**/settings");
    await page.goForward();
    await page.waitForURL("**/settings/nickname");

    // Assert
    await expect(nicknameInput).toBeVisible();
    await expect(alert).toBeHidden();
  });

  test("로그아웃 실패", async ({ page }) => {
    // Arrange: 요청을 끊어 함께 쓰는 로그인 상태는 그대로 둔다
    await openScreen(page, "/", page.getByRole("link", { name: "설정" }));
    await page.getByRole("link", { name: "설정" }).click();
    await expect(page.getByText(E2E_MEMBER.nickname, { exact: true })).toBeVisible();
    await page.route("**/auth/signout", (route) => route.abort("connectionreset"));
    await page.getByRole("button", { name: "로그아웃" }).click();
    const alert = page.getByRole("alert").filter({ hasText: "로그아웃하지 못했어요" });
    await expect(alert).toBeVisible();
    await page.unroute("**/auth/signout");

    // Act: 홈에 다녀온다
    await page.goBack();
    await page.waitForURL((url) => url.pathname === "/");
    await page.getByRole("link", { name: "설정" }).click();
    await page.waitForURL("**/settings");

    // Assert
    await expect(page.getByRole("button", { name: "로그아웃" })).toBeVisible();
    await expect(alert).toBeHidden();
  });
});

test.describe("띄어쓰기 없는 긴 글자", () => {
  test("하고 싶은 것 지우기 창의 설명은 창 안에서 줄을 바꾼다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: UNBROKEN_TEXT });
    try {
      await openScreen(page, `/todos/${id}/edit`, page.locator("#todo-content").locator("visible=true"));

      // Act
      await page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true").click();
      const dialog = page.getByRole("dialog", { name: "이 항목을 지울까요?" });
      await expect(dialog).toBeVisible();

      // Assert
      expect(await getHorizontalOverflow(dialog.getByText(UNBROKEN_TEXT))).toBe(0);
    } finally {
      await deleteTodo();
    }
  });

  test("사진 한마디는 화면 안에서 줄을 바꾼다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: createTestName("긴 한마디", testInfo) });
    try {
      await setRecordSearchFields(id, { memo: "", caption: UNBROKEN_TEXT });

      // Act
      await openScreen(page, `/dates/${id}`, page.getByText(UNBROKEN_TEXT).locator("visible=true"));

      // Assert
      expect(await getHorizontalOverflow(page.getByText(UNBROKEN_TEXT).locator("visible=true"))).toBe(0);
    } finally {
      await deleteRecord();
    }
  });
});
