import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { PHOTO_RECORD } from "./support/constants";
import { createDisposableRecord } from "./support/seed";
import { expect, test } from "./support/test";

const openAndReadPhotoUrl = async (page: Page, path: string, photo: Locator): Promise<string | null> => {
  await page.goto(path);
  const visiblePhoto = photo.locator("visible=true");
  await expect(visiblePhoto).toBeVisible();
  return visiblePhoto.getAttribute("src");
};

test("화면을 다시 열어도 같은 사진은 같은 주소로 그린다", async ({ page }) => {
  const coupleImage = page.getByRole("img", { name: "커플 사진" });
  const recordImage = page.getByRole("img", { name: PHOTO_RECORD.title });

  const coupleUrl = await openAndReadPhotoUrl(page, "/", coupleImage);
  const recordUrl = await openAndReadPhotoUrl(page, RECORDS_PATH, recordImage);

  expect(await openAndReadPhotoUrl(page, "/", coupleImage)).toBe(coupleUrl);
  expect(await openAndReadPhotoUrl(page, RECORDS_PATH, recordImage)).toBe(recordUrl);
});

test("기록을 지우면 그 사진 주소를 다시 쓰지 않는다", async ({ page }) => {
  const id = randomUUID();
  const title = `E2E 지울 사진 ${id}`;
  const deleteRecord = await createDisposableRecord({ id, title });

  try {
    expect(await openAndReadPhotoUrl(page, RECORDS_PATH, page.getByRole("img", { name: title }))).toContain(id);
    await deleteRecord();

    await page.goto(RECORDS_PATH);
    await expect(page.getByRole("img", { name: PHOTO_RECORD.title }).locator("visible=true")).toBeVisible();

    // 요청 기록으로 재면 지우기 전 화면이 미리 불러오던 요청까지 잡히므로, 새로 그린 화면의 주소를 본다
    await expect(page.locator(`img[src*="${id}"]`)).toHaveCount(0);
  } finally {
    await deleteRecord();
  }
});
