import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { PHOTO_FIXTURE_PATH } from "./support/constants";
import { addPhotoAsPartner, createDisposableRecord, listRecordFiles } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const CONFLICT_MESSAGE = "그사이 이 기록이 바뀌어 저장하지 않았어요";

const getTitleField = (page: Page) => page.locator("#title").locator("visible=true");
const getSaveButton = (page: Page) => page.locator('main button[type="submit"]').locator("visible=true");

test.describe("수정 화면을 연 사이 상대가 기록을 고치면", () => {
  test("저장을 거부해 상대의 사진이 지워지지 않고, 최신 내용을 불러와 다시 고칠 수 있다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = `오래된 화면 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteRecord = await createDisposableRecord({ id, title });

    try {
      await openScreen(page, `/dates/${id}/edit`, getTitleField(page));
      await addPhotoAsPartner(id);
      await getTitleField(page).fill(`${title} 내 수정`);
      await page.getByLabel("사진 고르기").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO_FIXTURE_PATH) });
      await page.getByRole("button", { name: "2번째 사진 빼기" }).waitFor();
      const filesBefore = await listRecordFiles(id);

      // Act
      await getSaveButton(page).tap();

      // Assert: 저장되지 않고, 쓰던 내용과 상대의 사진이 그대로다
      await expect(page.locator("main").getByRole("alert").locator("visible=true")).toContainText(CONFLICT_MESSAGE);
      await expect(getTitleField(page)).toHaveValue(`${title} 내 수정`);
      expect(new URL(page.url()).pathname).toBe(`/dates/${id}/edit`);
      expect(await listRecordFiles(id)).toEqual(filesBefore);

      // Act: 최신 내용을 불러온다
      await page.getByRole("button", { name: "최신 내용 불러오기" }).tap();

      // Assert: 상대의 사진이 보이고 다시 저장할 수 있다
      await expect(page.getByRole("button", { name: "2번째 사진 빼기" })).toBeVisible();
      await expect(getTitleField(page)).toHaveValue(title);
      await getTitleField(page).fill(`${title} 다시 고침`);
      await getSaveButton(page).tap();
      await page.waitForURL(`**/dates/${id}`);
      await expect(page.getByRole("heading", { name: `${title} 다시 고침` })).toBeVisible();
      expect(await listRecordFiles(id)).toEqual(filesBefore);
    } finally {
      await deleteRecord();
    }
  });

  test("상대가 고치지 않았으면 같은 화면에서 두 번 저장 실패해도 저장된다", async ({ page }, testInfo) => {
    // Arrange: 처음 요청은 서버가 처리했지만 응답이 끊긴다
    const id = randomUUID();
    const title = `내 재시도 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteRecord = await createDisposableRecord({ id, title });
    const url = "**/rest/v1/rpc/update_date_record";

    try {
      await openScreen(page, `/dates/${id}/edit`, getTitleField(page));
      await getTitleField(page).fill(`${title} 고침`);
      await page.route(url, async (route) => {
        await route.fetch();
        await route.abort("connectionreset");
      });

      // Act
      await getSaveButton(page).tap();
      await expect(page.locator("main").getByRole("alert").locator("visible=true")).toContainText("저장됐는지 확인하지 못했어요");
      await page.unroute(url);
      await getSaveButton(page).tap();

      // Assert: 내 앞선 저장을 상대의 저장으로 오해하지 않는다
      await page.waitForURL(`**/dates/${id}`);
      await expect(page.getByRole("heading", { name: `${title} 고침` })).toBeVisible();
    } finally {
      await deleteRecord();
    }
  });

  test("내가 고쳐 다시 저장한 뒤에는, 앞선 저장을 보고 있던 상대의 저장을 거부한다", async ({ page }, testInfo) => {
    // Arrange: 내 첫 저장은 서버가 처리했지만 응답이 끊기고, 상대는 그 내용으로 화면을 연다
    const id = randomUUID();
    const title = `고쳐서 다시 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteRecord = await createDisposableRecord({ id, title });
    const url = "**/rest/v1/rpc/update_date_record";
    const partnerPage = await page.context().newPage();

    try {
      await openScreen(page, `/dates/${id}/edit`, getTitleField(page));
      await getTitleField(page).fill(`${title} 첫 저장`);
      await page.route(url, async (route) => {
        await route.fetch();
        await route.abort("connectionreset");
      });
      await getSaveButton(page).tap();
      await expect(page.locator("main").getByRole("alert").locator("visible=true")).toContainText("저장됐는지 확인하지 못했어요");
      await page.unroute(url);
      await openScreen(partnerPage, `/dates/${id}/edit`, getTitleField(partnerPage));
      await expect(getTitleField(partnerPage)).toHaveValue(`${title} 첫 저장`);

      // Act: 내가 내용을 고쳐 다시 저장한 뒤, 상대가 저장한다
      await getTitleField(page).fill(`${title} 내 최종`);
      await getSaveButton(page).tap();
      await page.waitForURL(`**/dates/${id}`);
      await getTitleField(partnerPage).fill(`${title} 상대 저장`);
      await getSaveButton(partnerPage).tap();

      // Assert: 내가 고친 내용이 그대로다
      await expect(partnerPage.locator("main").getByRole("alert").locator("visible=true")).toContainText(CONFLICT_MESSAGE);
      await page.reload();
      await expect(page.getByRole("heading", { name: `${title} 내 최종` })).toBeVisible();
    } finally {
      await partnerPage.close();
      await deleteRecord();
    }
  });

  test("저장 중 화면을 떠났다 돌아와도 최신 내용을 불러올 수 있다", async ({ page }, testInfo) => {
    // Arrange: 상대가 먼저 고쳤고, 내 저장 요청은 화면을 떠날 때까지 붙잡아 둔다
    const id = randomUUID();
    const title = `떠났다 돌아옴 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteRecord = await createDisposableRecord({ id, title });
    let releaseRequest = () => {};
    const released = new Promise<void>((resolve) => {
      releaseRequest = resolve;
    });

    try {
      await openScreen(page, `/dates/${id}/edit`, getTitleField(page));
      await addPhotoAsPartner(id);
      await getTitleField(page).fill(`${title} 내 수정`);
      await page.route("**/rest/v1/rpc/update_date_record", async (route) => {
        await released;
        await route.continue();
      });
      const requested = page.waitForRequest("**/rest/v1/rpc/update_date_record");
      await getSaveButton(page).tap();
      await requested;

      // Act
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**/dates/${id}`);
      releaseRequest();
      await page.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/dates/${id}/edit`);

      // Assert: 다시 저장해도 거부되므로 저장 버튼 대신 불러오기 버튼이 보인다
      await expect(page.getByRole("button", { name: "최신 내용 불러오기" })).toBeVisible();
      await expect(getSaveButton(page)).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });
});
