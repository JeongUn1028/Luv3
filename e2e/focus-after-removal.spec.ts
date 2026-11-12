import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { MAX_TAGS } from "@/lib/dates/form";
import { createDisposableRecord, createDisposableTodo, setRecordTags } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getGroupPhoto, pickPhoto } from "./support/actions";
import { createTestName } from "./support/names";

// 누른 버튼이 사라지거나 비활성이 되어도 키보드·화면 읽기 프로그램 사용자가 자리를 잃지 않게 한다(#260)

const getVisibleButton = (page: Page, name: string): Locator => page.getByRole("button", { name, exact: true }).locator("visible=true");

/** 키보드로 누른다. 화면을 누르면 아이폰 Safari는 버튼에 초점을 주지 않아, 초점을 옮길 일이 없다 */
const pressWithKeyboard = async (locator: Locator, key: "Enter" | "Space" = "Enter"): Promise<void> => {
  await locator.focus();
  await locator.press(key);
};

const openNewRecordForm = (page: Page): Promise<void> => openScreen(page, "/dates/new", page.locator("#memo").locator("visible=true"));

test.describe("기록 폼", () => {
  test("사진을 빼면 같은 모음의 다음 사진이 골라져 빼기에 초점이 남고, 모음의 마지막 사진을 빼면 새 모음 만들기로 초점이 간다", async ({ page }) => {
    // Arrange: 한 모음에 사진 두 장
    await openNewRecordForm(page);
    await pickPhoto(page, 1);
    await pickPhoto(page, 2, { groupNumber: 1 });
    await getGroupPhoto(page, 1, 1).click();

    // Act
    await pressWithKeyboard(getVisibleButton(page, "이 사진 빼기"));

    // Assert: 남은 사진이 골라지고 빼기 버튼이 그대로 남는다
    await expect(getVisibleButton(page, "이 사진 빼기")).toBeFocused();
    await expect(getGroupPhoto(page, 1, 1)).toHaveAttribute("aria-pressed", "true");

    // Act
    await page.keyboard.press("Enter");

    // Assert
    await expect(getVisibleButton(page, "새 모음 만들기 · 사진 고르기")).toBeFocused();
  });

  test("모음을 빼면 다음 모음의 빼기로, 마지막 모음을 빼면 새 모음 만들기로 초점이 간다", async ({ page }) => {
    // Arrange
    await openNewRecordForm(page);
    await pickPhoto(page, 1);
    await pickPhoto(page, 2);

    // Act
    await pressWithKeyboard(getVisibleButton(page, "모음 1 빼기"));

    // Assert: 남은 모음이 모음 1이 된다
    await expect(getVisibleButton(page, "모음 1 빼기")).toBeFocused();

    // Act
    await page.keyboard.press("Enter");

    // Assert
    await expect(getVisibleButton(page, "새 모음 만들기 · 사진 고르기")).toBeFocused();
  });

  test("사진·모음 순서를 끝까지 옮겨도 누른 버튼에 초점이 남는다", async ({ page }) => {
    // Arrange: 사진 두 장인 모음과 한 장인 모음
    await openNewRecordForm(page);
    await pickPhoto(page, 1);
    await pickPhoto(page, 2, { groupNumber: 1 });
    await pickPhoto(page, 3);
    await getGroupPhoto(page, 1, 1).click();

    // Act: 첫 사진을 뒤로 보내면 그 사진은 끝이라 "뒤로"를 더 누를 수 없다
    await pressWithKeyboard(getVisibleButton(page, "뒤로"));

    // Assert
    const back = getVisibleButton(page, "뒤로");
    await expect(back).toBeFocused();
    await expect(back).toHaveAttribute("aria-disabled", "true");
    await expect(getGroupPhoto(page, 1, 2)).toHaveAttribute("aria-pressed", "true");

    // Act: 끝에서 한 번 더 눌러도 순서는 그대로다. 모음도 아래로 끝까지 옮긴다
    await page.keyboard.press("Enter");
    await expect(back).toBeFocused();
    await pressWithKeyboard(getVisibleButton(page, "모음 1 아래로 옮기기"));

    // Assert: 옮긴 모음은 모음 2가 되고 그 버튼에 초점이 남는다
    const groupDown = getVisibleButton(page, "모음 2 아래로 옮기기");
    await expect(groupDown).toBeFocused();
    await expect(groupDown).toHaveAttribute("aria-disabled", "true");
    await expect(getGroupPhoto(page, 2, 2)).toHaveAttribute("aria-pressed", "true");
  });

  test("태그를 빼면 다음 태그로, 마지막 태그를 빼면 태그 칸으로 초점이 간다", async ({ page }) => {
    // Arrange
    await openNewRecordForm(page);
    await getVisibleButton(page, "태그 추가").click();
    const tagInput = page.locator("#tag-input").locator("visible=true");
    for (const tag of ["첫태그", "둘태그"]) {
      await tagInput.fill(tag);
      await tagInput.press("Enter");
    }

    // Act
    await pressWithKeyboard(getVisibleButton(page, "첫태그 태그 빼기"));

    // Assert
    await expect(getVisibleButton(page, "둘태그 태그 빼기")).toBeFocused();

    // Act
    await page.keyboard.press("Enter");

    // Assert
    await expect(tagInput).toBeFocused();
  });

  test("전에 쓴 태그를 붙여도 초점이 태그 칸 안에 남는다", async ({ page }, testInfo) => {
    // Arrange: 전에 쓴 태그가 하나는 있게 한다
    const id = randomUUID();
    // 태그는 10자까지라 무작위 조각만 붙인다
    const suggestion = `추천${randomUUID().slice(0, 6)}`;
    const deleteRecord = await createDisposableRecord({ id, title: createTestName("추천 태그", testInfo) });
    try {
      await setRecordTags(id, [suggestion]);
      await openNewRecordForm(page);
      await getVisibleButton(page, "태그 추가").click();

      // Act
      await pressWithKeyboard(getVisibleButton(page, `${suggestion} 태그 붙이기`));

      // Assert: 누른 추천은 사라지고, 초점은 다른 추천이나 태그 칸으로 간다
      await expect(getVisibleButton(page, `${suggestion} 태그 빼기`)).toBeVisible();
      const focusedTagControl = page.locator("#tag-input, [aria-label$='태그 붙이기']").locator("visible=true").and(page.locator(":focus"));
      await expect(focusedTagControl).toHaveCount(1);
    } finally {
      await deleteRecord();
    }
  });
});

test("태그가 가득 차 전에 쓴 태그를 붙이지 못하면 초점이 그 버튼에 남는다", async ({ page }, testInfo) => {
  // Arrange
  const id = randomUUID();
  const suggestion = `추천${randomUUID().slice(0, 6)}`;
  const deleteRecord = await createDisposableRecord({ id, title: createTestName("가득 찬 태그", testInfo) });
  try {
    await setRecordTags(id, [suggestion]);
    await openNewRecordForm(page);
    await getVisibleButton(page, "태그 추가").click();
    const tagInput = page.locator("#tag-input").locator("visible=true");
    for (let count = 1; count <= MAX_TAGS; count += 1) {
      await tagInput.fill(`가득${count}`);
      await tagInput.press("Enter");
    }
    const suggestionButton = getVisibleButton(page, `${suggestion} 태그 붙이기`);

    // Act
    await pressWithKeyboard(suggestionButton);

    // Assert
    await expect(page.locator("#tag-error").locator("visible=true")).toHaveText(`태그는 ${MAX_TAGS}개까지 붙일 수 있어요.`);
    await expect(suggestionButton).toBeFocused();
  } finally {
    await deleteRecord();
  }
});

test.describe("하고 싶은 것 목록", () => {
  test("완료를 체크하거나 풀어 목록이 바뀌어도 그 항목의 체크에 초점이 남는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const content = createTestName("초점 완료", testInfo);
    const deleteTodo = await createDisposableTodo({ id, content });
    try {
      await openScreen(page, "/todos", page.getByRole("link", { name: content }));
      const checkbox = page.getByRole("checkbox", { name: `${content} 완료` });

      // Act: 완료한 항목은 아래의 완료 목록으로 옮겨 그린다
      await pressWithKeyboard(checkbox, "Space");

      // Assert
      await expect(page.getByRole("region", { name: /완료/ }).getByRole("checkbox", { name: `${content} 완료` })).toBeChecked();
      await expect(checkbox).toBeFocused();

      // Act
      await page.keyboard.press("Space");

      // Assert
      await expect(page.getByRole("list", { name: "하고 싶은 것" }).getByRole("checkbox", { name: `${content} 완료` })).not.toBeChecked();
      await expect(checkbox).toBeFocused();
    } finally {
      await deleteTodo();
    }
  });
});

test.describe("지우기 확인 창", () => {
  test("지우는 중에는 Esc를 연달아 눌러도 닫히지 않고, 실패하면 삭제 버튼에 초점이 남는다", async ({ page }, testInfo) => {
    // Arrange: 지우기 요청을 붙잡아 두었다가 실패시킨다
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: createTestName("초점 지우기", testInfo) });
    let failDelete: () => void = () => undefined;
    try {
      await page.route("**/rest/v1/todos*", (route: Route) => {
        if (route.request().method() !== "DELETE") return route.fallback();
        return new Promise<void>((resolve) => {
          failDelete = () => {
            // 정리할 때 한 번 더 불러도 같은 요청을 두 번 끝내지 않는다
            failDelete = () => undefined;
            resolve(route.abort("connectionreset"));
          };
        });
      });
      await openScreen(page, `/todos/${id}/edit`, page.locator("#todo-content").locator("visible=true"));
      await getVisibleButton(page, "삭제").click();
      const dialog = page.getByRole("dialog", { name: "이 항목을 지울까요?" });
      await expect(dialog).toBeVisible();

      // Act
      await pressWithKeyboard(dialog.getByRole("button", { name: "삭제", exact: true }));
      const busyConfirm = dialog.getByRole("button", { name: "지우는 중…" });
      await expect(busyConfirm).toBeVisible();
      for (let count = 0; count < 4; count += 1) await page.keyboard.press("Escape");

      // Assert: 닫히지 않고, 작업 중인 버튼이 초점을 지킨다
      await expect(dialog).toBeVisible();
      await expect(busyConfirm).toBeFocused();
      await expect(busyConfirm).toHaveAttribute("aria-disabled", "true");

      // Act
      failDelete();

      // Assert
      await expect(dialog.getByRole("alert")).toHaveText("지우지 못했어요. 잠시 후 다시 시도해 주세요.");
      await expect(dialog.getByRole("button", { name: "삭제", exact: true })).toBeFocused();
    } finally {
      failDelete();
      await deleteTodo();
    }
  });
});
