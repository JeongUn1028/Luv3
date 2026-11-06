import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { toKstDate } from "@/lib/anniversary";
import { PHOTO_FIXTURE_PATH } from "./support/constants";
import { pickDate } from "./support/date-picker";
import { createDisposableRecord, deleteRecordWithFiles, getRecordIdsByTitle, listRecordFiles } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const FAILURE_MESSAGE = "저장됐는지 확인하지 못했어요";

const getSaveButton = (page: Page) => page.locator('main button[type="submit"]').locator("visible=true");

const pickPhoto = async (page: Page, order: number): Promise<void> => {
  await page.getByLabel("사진 고르기").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO_FIXTURE_PATH) });
  await page.getByRole("button", { name: `${order}번째 사진 빼기` }).waitFor();
};

/** 서버는 요청을 처리했지만 응답이 앱까지 오지 못한 상황을 만든다 */
const loseResponses = async (page: Page, url: string): Promise<void> => {
  await page.route(url, async (route) => {
    await route.fetch();
    await route.abort("connectionreset");
  });
};

test.describe("저장은 됐는데 응답만 끊기면", () => {
  test("새 기록은 다시 저장해도 하나만 남고 사진 파일도 그대로다", async ({ page }, testInfo) => {
    // Arrange
    const title = `응답 끊김 새 기록 ${testInfo.project.name} ${randomUUID().slice(0, 8)}`;
    await openScreen(page, "/dates/new", page.locator("#memo").locator("visible=true"));
    await pickPhoto(page, 1);
    // 오늘 날짜면 나란히 도는 홈 테스트의 "최근 기록" 자리를 잠깐 차지한다
    await pickDate(page, "#date", toKstDate(new Date(Date.now() - 24 * 60 * 60 * 1000)));
    await page.locator("#title").locator("visible=true").fill(title);
    const url = "**/rest/v1/rpc/create_date_record";
    await loseResponses(page, url);

    try {
      // Act: 저장이 실패한 것처럼 보이는 동안에도 파일이 지워지면 안 된다
      await getSaveButton(page).tap();
      await expect(page.getByRole("alert").filter({ hasText: FAILURE_MESSAGE })).toBeVisible();
      const [savedId] = await getRecordIdsByTitle(title);
      expect(savedId).toBeDefined();
      expect(await listRecordFiles(savedId ?? "")).toHaveLength(2);

      await page.unroute(url);
      await getSaveButton(page).tap();
      // 저장된 내용을 바로 확인할 수 있게 그 기록으로 간다
      await page.waitForURL(`**/dates/${savedId}`);

      // Assert
      expect(await getRecordIdsByTitle(title)).toEqual([savedId]);
      expect(await listRecordFiles(savedId ?? "")).toHaveLength(2);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("기록 고치기는 새 사진 파일을 지우지 않고 다시 저장할 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = `응답 끊김 고치기 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteRecord = await createDisposableRecord({ id, title });
    const url = "**/rest/v1/rpc/update_date_record";

    try {
      await openScreen(page, `/dates/${id}/edit`, page.locator("#memo").locator("visible=true"));
      await pickPhoto(page, 2);
      const filesBefore = (await listRecordFiles(id)).length;
      await loseResponses(page, url);

      // Act
      await getSaveButton(page).tap();
      await expect(page.getByRole("alert").filter({ hasText: FAILURE_MESSAGE })).toBeVisible();
      expect(await listRecordFiles(id)).toHaveLength(filesBefore + 2);

      await page.unroute(url);
      await getSaveButton(page).tap();
      await page.waitForURL(new RegExp(`/dates/${id}$`));

      // Assert
      expect(await listRecordFiles(id)).toHaveLength(filesBefore + 2);
    } finally {
      await deleteRecord();
    }
  });
});
