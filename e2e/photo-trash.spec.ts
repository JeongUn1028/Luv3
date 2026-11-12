import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { SETTINGS_PATH, SETTINGS_TRASH_PATH } from "@/lib/auth/paths";
import { RECORDS_PATH } from "@/lib/dates/album";
import { createDisposableRecord, deleteRecordWithFiles, moveRecordToTrash } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

/** 글 안에서 `word`가 몇 줄에 걸쳐 그려졌는지 센다. 낱말 중간에서 줄이 바뀌면 2 이상이다 */
const countWordLines = (text: Locator, word: string): Promise<number> =>
  text.evaluate((element, target) => {
    const node = element.firstChild;
    const start = node?.textContent?.indexOf(target) ?? -1;
    if (!node || start < 0) return 0;
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, start + target.length);
    return new Set([...range.getClientRects()].map(({ top }) => Math.round(top))).size;
  }, word);

/** 휴지통에서 그 기록의 사진 묶음. 묶음 제목은 "11월 11일 · 제목"이다 */
const getTrashSection = (page: Page, title: string): Locator => page.getByRole("region", { name: new RegExp(`· ${title}$`) });

const SAVED_FILE_NAME = /^luv3-\d{4}-\d{2}-\d{2}-[0-9a-f]{8}\.jpg$/;

interface SharedFile {
  name: string;
  type: string;
  size: number;
}

/** 공유 창을 지원하는 휴대폰처럼 꾸미고, 넘긴 파일을 `window.sharedFiles`에 남긴다. `isOpenKept`면 공유 창을 닫지 않는다 */
const fakeFileShare = async (page: Page, { isOpenKept = false }: { isOpenKept?: boolean } = {}): Promise<void> => {
  await page.addInitScript((keepsOpen) => {
    const shared: SharedFile[] = [];
    Object.assign(window, { sharedFiles: shared });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: (data: ShareData) => (data.files?.length ?? 0) > 0 });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (data: ShareData) => {
        for (const file of data.files ?? []) shared.push({ name: file.name, type: file.type, size: file.size });
        if (keepsOpen) await new Promise(() => undefined);
      },
    });
  }, isOpenKept);
};

/** 파일 공유가 없는 브라우저처럼 꾸민다 */
const removeFileShare = async (page: Page): Promise<void> => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "canShare", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
  });
};

const readSharedFiles = (page: Page): Promise<SharedFile[]> =>
  page.evaluate(() => (window as unknown as { sharedFiles: SharedFile[] }).sharedFiles);

/** 기록을 지워 휴지통에 사진 한 장을 남기고, 휴지통에서 그 사진을 연다 */
const openTrashedPhoto = async (page: Page, title: string): Promise<string> => {
  const id = randomUUID();
  await createDisposableRecord({ id, title });
  await moveRecordToTrash(id);
  await openScreen(page, SETTINGS_TRASH_PATH, getTrashSection(page, title));
  await getTrashSection(page, title).getByRole("link", { name: /^사진 1,/ }).click();
  await page.waitForURL(new RegExp(`${SETTINGS_TRASH_PATH}/[0-9a-f-]{36}$`));
  return id;
};

test.describe("휴지통", () => {
  test("기록을 지우면 확인 창이 사진은 휴지통에 남는다고 알리고, 설정 > 휴지통에서 그 사진을 남은 날과 함께 볼 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("휴지통 기록", testInfo);
    await createDisposableRecord({ id, title });

    try {
      await openScreen(page, `/dates/${id}`, page.getByRole("heading", { name: title }));

      // Act
      await page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true").click();
      const dialog = page.getByRole("dialog", { name: "이 기록을 지울까요?" });
      await expect(dialog).toHaveAccessibleDescription("글과 두 사람이 남긴 댓글은 지워지고 되돌릴 수 없어요. 사진 1장은 설정 > 휴지통에 30일 동안 남아요.");
      // 문구가 두 줄이 되어도 낱말 중간("없어 / 요.")에서 끊지 않는다
      expect(await countWordLines(dialog.getByText(/^글과 두 사람이/), "없어요.")).toBe(1);
      await dialog.getByRole("button", { name: "삭제", exact: true }).click();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await page.goto(SETTINGS_PATH);
      await page.getByRole("link", { name: "휴지통" }).click();
      await page.waitForURL(`**${SETTINGS_TRASH_PATH}`);

      // Assert
      const section = getTrashSection(page, title);
      await expect(section).toContainText("오늘 지움 · 기록째 삭제");
      await expect(section.getByRole("link")).toHaveCount(1);
      await expect(section.getByRole("link")).toHaveAccessibleName("사진 1, 30일 남음");
    } finally {
      await deleteRecordWithFiles(id);
    }
  });

  test("휴지통 사진을 열어 휴대폰에 저장을 누르면 공유 창에 원본 사진 파일을 넘긴다", async ({ page }, testInfo) => {
    // Arrange
    await fakeFileShare(page);
    const title = createTestName("휴지통 저장", testInfo);
    const id = await openTrashedPhoto(page, title);

    try {
      await expect(page.getByText("30일 남았어요")).toBeVisible();
      // 지나온 휴지통 목록이 숨겨진 채 남아 있어 보이는 것만 본다
      await expect(page.getByText(`· ${title}`).locator("visible=true")).toBeVisible();

      // Act
      await page.getByRole("button", { name: "휴대폰에 저장" }).click();

      // Assert
      await expect.poll(() => readSharedFiles(page)).toEqual([{ name: expect.stringMatching(SAVED_FILE_NAME), type: "image/jpeg", size: expect.any(Number) }]);
      const [sharedFile] = await readSharedFiles(page);
      expect(sharedFile?.size).toBeGreaterThan(0);
    } finally {
      await deleteRecordWithFiles(id);
    }
  });

  test("공유 창이 열려 있는 동안에는 휴대폰에 저장을 다시 누를 수 없다", async ({ page }, testInfo) => {
    // Arrange
    await fakeFileShare(page, { isOpenKept: true });
    const title = createTestName("휴지통 두 번", testInfo);
    const id = await openTrashedPhoto(page, title);

    try {
      // Act
      const saveButton = page.getByRole("button", { name: "휴대폰에 저장" });
      await saveButton.click();

      // Assert
      await expect(saveButton).toBeDisabled();
      await saveButton.dispatchEvent("click");
      expect(await readSharedFiles(page)).toHaveLength(1);
    } finally {
      await deleteRecordWithFiles(id);
    }
  });

  test("파일 공유가 없는 브라우저에서는 휴대폰에 저장을 누르면 사진을 내려받는다", async ({ page }, testInfo) => {
    // Arrange
    await removeFileShare(page);
    const title = createTestName("휴지통 내려받기", testInfo);
    const id = await openTrashedPhoto(page, title);

    try {
      // Act
      const downloadEvent = page.waitForEvent("download");
      await page.getByRole("button", { name: "휴대폰에 저장" }).click();

      // Assert
      expect((await downloadEvent).suggestedFilename()).toMatch(SAVED_FILE_NAME);
      await expect(page.getByRole("status").filter({ hasText: "사진을 내려받았어요." })).toBeVisible();
    } finally {
      await deleteRecordWithFiles(id);
    }
  });

  test("정리됐거나 없는 휴지통 사진 주소를 열면 찾을 수 없다고 알리고 휴지통으로 돌아갈 수 있다", async ({ page }) => {
    // Act
    await page.goto(`${SETTINGS_TRASH_PATH}/${randomUUID()}`);

    // Assert
    await expect(page.getByRole("heading", { name: "사진을 찾을 수 없어요" })).toBeVisible();
    await expect(page.getByRole("link", { name: "휴지통으로" })).toHaveAttribute("href", SETTINGS_TRASH_PATH);
  });
});
