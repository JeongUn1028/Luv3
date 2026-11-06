import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { PHOTO_FIXTURE_PATH } from "./support/constants";
import { createDisposableRecord, deleteRecordWithFiles, getRecordIdsByTitle, setRecordTags } from "./support/seed";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";

const openTagField = async (page: Page): Promise<void> => {
  await page.getByRole("button", { name: "태그 추가" }).click();
};

test.describe("기록 태그", () => {
  test("태그가 없으면 칸을 닫아 두고, 태그 추가를 누르면 칸이 열리며 초점이 간다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/dates/new", page.locator("#memo"));
    await expect(page.locator("#tag-input")).toHaveCount(0);

    // Act
    await openTagField(page);

    // Assert
    await expect(page.locator("#tag-input")).toBeFocused();
    await expect(page.getByRole("button", { name: "태그 추가" })).toHaveCount(0);
  });

  test("태그가 있는 기록은 칸을 열어 둔다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 태그 열림" });
    await setRecordTags(id, ["있던태그"]);

    try {
      // Act
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));

      // Assert
      await expect(page.locator("#tag-input")).toBeVisible();
      await expect(page.getByRole("button", { name: "있던태그 태그 빼기" })).toBeVisible();
    } finally {
      await deleteRecord();
    }
  });

  test("고치기에서 태그를 적어 더하면 상세에 보인다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 태그 더하기" });

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));

      // Act: 앞의 #은 지우고, Enter로 더해도 저장되지 않는다
      await openTagField(page);
      await page.locator("#tag-input").fill("#카페");
      await page.locator("#tag-input").press("Enter");
      await expect(page).toHaveURL(new RegExp(`/dates/${id}/edit`));
      await page.locator("#tag-input").fill("여행");
      await page.getByRole("button", { name: "추가" }).click();
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(new RegExp(`/dates/${id}$`));

      // Assert
      await expect(page.getByRole("list", { name: "태그" }).getByRole("listitem")).toHaveText(["카페", "여행"]);
    } finally {
      await deleteRecord();
    }
  });

  test("적어 두고 추가를 누르지 않은 태그도 저장한다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 태그 그대로 저장" });

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));

      // Act
      await openTagField(page);
      await page.locator("#tag-input").fill("산책");
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(new RegExp(`/dates/${id}$`));

      // Assert
      await expect(page.getByRole("list", { name: "태그" }).getByRole("listitem")).toHaveText(["산책"]);
    } finally {
      await deleteRecord();
    }
  });

  test("태그를 빼고 저장하면 상세에서 사라진다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 태그 빼기" });
    await setRecordTags(id, ["뺄태그"]);

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));

      // Act
      await page.getByRole("button", { name: "뺄태그 태그 빼기" }).click();
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(new RegExp(`/dates/${id}$`));

      // Assert
      await expect(page.getByRole("heading", { name: "E2E 태그 빼기" })).toBeVisible();
      await expect(page.getByRole("list", { name: "태그" })).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("전에 쓴 태그를 누르면 붙고 추천에서 빠지며, 적던 글자는 남는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const usedId = randomUUID();
    const usedTag = `추천${testInfo.project.name.slice(-2)}`;
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 태그 추천" });
    const deleteUsed = await createDisposableRecord({ id: usedId, title: "E2E 태그를 쓴 기록" });
    await setRecordTags(usedId, [usedTag]);

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));

      // Act
      await openTagField(page);
      await page.locator("#tag-input").fill("적던글자");
      await page.getByRole("button", { name: `${usedTag} 태그 붙이기` }).click();

      // Assert
      await expect(page.getByRole("button", { name: `${usedTag} 태그 빼기` })).toBeVisible();
      await expect(page.getByRole("button", { name: `${usedTag} 태그 붙이기` })).toHaveCount(0);
      await expect(page.locator("#tag-input")).toHaveValue("적던글자");
    } finally {
      await deleteRecord();
      await deleteUsed();
    }
  });

  test("태그가 너무 길면 저장하지 않고 알려 준다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 긴 태그" });

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));

      // Act
      await openTagField(page);
      await page.locator("#tag-input").fill("가나다라마바사아자차카");
      await page.getByRole("button", { name: "저장" }).click();

      // Assert
      await expect(page.getByText("태그는 10자까지 적을 수 있어요.")).toBeVisible();
      await expect(page).toHaveURL(new RegExp(`/dates/${id}/edit`));
      await expect(page.locator("#tag-input")).toHaveValue("가나다라마바사아자차카");
    } finally {
      await deleteRecord();
    }
  });

  test("새 기록을 태그와 함께 저장한다", async ({ page }, testInfo) => {
    // Arrange
    const title = `E2E 새 기록 태그 ${testInfo.project.name}`;
    await openScreen(page, "/dates/new", page.locator("#memo"));

    try {
      // Act
      await page.getByLabel("사진 고르기").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO_FIXTURE_PATH) });
      await page.getByRole("button", { name: "1번째 사진 빼기" }).waitFor();
      await page.locator("#title").fill(title);
      await openTagField(page);
      await page.locator("#tag-input").fill("새태그");
      await page.getByRole("button", { name: "추가" }).click();
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/records/);
      await page.getByRole("link", { name: new RegExp(title) }).click();

      // Assert
      await expect(page.getByRole("list", { name: "태그" }).getByRole("listitem")).toHaveText(["새태그"]);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("태그를 5개 붙여도 가로로 넘치지 않고 저장 버튼까지 내려간다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 태그 많은 폼" });
    await setRecordTags(id, ["가나다라마바사아자차", "아주긴태그이름이에요", "데이트장소모음이에요", "기념일에갔던곳이에요", "다음에또갈곳이에요"]);

    try {
      // Act
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo"));
      const saveButton = page.getByRole("button", { name: "저장" });
      await saveButton.scrollIntoViewIfNeeded();

      // Assert
      await expect(saveButton).toBeInViewport({ ratio: 1 });
      expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);
    } finally {
      await deleteRecord();
    }
  });
});
