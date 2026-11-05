import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { PHOTO_FIXTURE_PATH, PHOTO_RECORD } from "./support/constants";
import { createDisposableRecord, listRecordFiles } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const getVisibleLink = (page: Page, href: string) => page.locator(`a[href="${href}"]`).locator("visible=true");

test.describe("고치는 사이 지워진 기록", () => {
  for (const { name, goToList } of [
    { name: "머리글 뒤로 버튼", goToList: (page: Page) => page.getByRole("link", { name: "뒤로" }).locator("visible=true").click() },
    { name: "기록 목록으로 버튼", goToList: (page: Page) => page.getByRole("button", { name: "기록 목록으로" }).click() },
  ]) {
    test(`저장하면 이미 지워졌다고 알리고 새 사진을 남기지 않으며 ${name}으로 지워진 기록이 없는 목록에 돌아간다`, async ({ page }) => {
      const id = randomUUID();
      const deleteRecord = await createDisposableRecord({ id, title: `E2E 지울 기록 ${id.slice(0, 8)}` });
      try {
        // Arrange: 목록을 거쳐 들어와야 숨겨 둔 목록 화면이 예전 내용을 들고 있는 경우까지 잰다
        await openScreen(page, RECORDS_PATH, getVisibleLink(page, `/dates/${id}`));
        await getVisibleLink(page, `/dates/${id}`).tap();
        await getVisibleLink(page, `/dates/${id}/edit`).tap();
        await page.locator("#memo").locator("visible=true").waitFor();
        await page.getByLabel("사진 고르기").setInputFiles({
          name: "photo.jpg",
          mimeType: "image/jpeg",
          buffer: readFileSync(PHOTO_FIXTURE_PATH),
        });
        await page.getByRole("button", { name: "2번째 사진 빼기" }).waitFor();

        // Act
        await deleteRecord();
        await page.getByRole("button", { name: "저장" }).click();

        // Assert
        await expect(page.locator("form").getByRole("alert").locator("visible=true")).toContainText("이미 지워졌어요");
        expect(await listRecordFiles(id)).toEqual([]);

        await goToList(page);
        await page.waitForURL(`**${RECORDS_PATH}`);
        await expect(getVisibleLink(page, `/dates/${PHOTO_RECORD.id}`)).toBeVisible();
        await expect(getVisibleLink(page, `/dates/${id}`)).toHaveCount(0);
      } finally {
        await deleteRecord();
      }
    });
  }
});
