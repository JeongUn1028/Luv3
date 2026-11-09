import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { toKstDate } from "@/lib/anniversary";
import { RECORDS_PATH } from "@/lib/dates/album";
import { PHOTO_RECORD } from "./support/constants";
import { pickDate } from "./support/date-picker";
import { addPhotoAsPartner, createDisposableRecord, deleteRecordWithFiles, getRecordIdsByTitle, listRecordFiles } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { getSubmitButton, getVisibleLink, pickPhoto } from "./support/actions";

// 기록 저장이 실패하는 경우를 모은 스펙(#196). 저장하는 사이 다른 화면으로 옮기는 경우는 leave-while-saving.spec.ts에 있다

const CREATE_RECORD_URL = "**/rest/v1/rpc/create_date_record";
const UPDATE_RECORD_URL = "**/rest/v1/rpc/update_date_record";
const RESPONSE_LOST_MESSAGE = "저장됐는지 확인하지 못했어요";
const CONFLICT_MESSAGE = "그사이 이 기록이 바뀌어 저장하지 않았어요";

const getTitleField = (page: Page) => page.locator("#title").locator("visible=true");

const getFormAlert = (page: Page) => page.locator("main").getByRole("alert").locator("visible=true");

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
    await getTitleField(page).fill(title);
    await loseResponses(page, CREATE_RECORD_URL);

    try {
      // Act: 저장이 실패한 것처럼 보이는 동안에도 파일이 지워지면 안 된다
      await getSubmitButton(page).tap();
      await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);
      const [savedId] = await getRecordIdsByTitle(title);
      expect(savedId).toBeDefined();
      expect(await listRecordFiles(savedId ?? "")).toHaveLength(2);

      await page.unroute(CREATE_RECORD_URL);
      await getSubmitButton(page).tap();
      // 저장된 내용을 바로 확인할 수 있게 그 기록으로 간다
      await page.waitForURL(`**/dates/${savedId}`);

      // Assert
      expect(await getRecordIdsByTitle(title)).toEqual([savedId]);
      expect(await listRecordFiles(savedId ?? "")).toHaveLength(2);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("기록 고치기는 다시 저장하면 고친 내용이 저장되고 새 사진 파일도 지워지지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = `응답 끊김 고치기 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteRecord = await createDisposableRecord({ id, title });

    try {
      await openScreen(page, `/dates/${id}/edit`, getTitleField(page));
      await getTitleField(page).fill(`${title} 고침`);
      await pickPhoto(page, 2);
      const filesBefore = (await listRecordFiles(id)).length;
      await loseResponses(page, UPDATE_RECORD_URL);

      // Act
      await getSubmitButton(page).tap();
      await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);
      expect(await listRecordFiles(id)).toHaveLength(filesBefore + 2);

      await page.unroute(UPDATE_RECORD_URL);
      await getSubmitButton(page).tap();

      // Assert: 내 앞선 저장을 상대의 저장으로 오해해 거부하지 않는다
      await page.waitForURL(new RegExp(`/dates/${id}$`));
      await expect(page.getByRole("heading", { name: `${title} 고침` })).toBeVisible();
      expect(await listRecordFiles(id)).toHaveLength(filesBefore + 2);
    } finally {
      await deleteRecord();
    }
  });
});

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
      await pickPhoto(page, 2);
      const filesBefore = await listRecordFiles(id);

      // Act
      await getSubmitButton(page).tap();

      // Assert: 저장되지 않고, 쓰던 내용과 상대의 사진이 그대로다
      await expect(getFormAlert(page)).toContainText(CONFLICT_MESSAGE);
      await expect(getTitleField(page)).toHaveValue(`${title} 내 수정`);
      expect(new URL(page.url()).pathname).toBe(`/dates/${id}/edit`);
      expect(await listRecordFiles(id)).toEqual(filesBefore);

      // Act: 최신 내용을 불러온다
      await page.getByRole("button", { name: "최신 내용 불러오기" }).tap();

      // Assert: 상대의 사진이 보이고 다시 저장할 수 있다
      await expect(page.getByRole("button", { name: "2번째 사진 빼기" })).toBeVisible();
      await expect(getTitleField(page)).toHaveValue(title);
      await getTitleField(page).fill(`${title} 다시 고침`);
      await getSubmitButton(page).tap();
      await page.waitForURL(`**/dates/${id}`);
      await expect(page.getByRole("heading", { name: `${title} 다시 고침` })).toBeVisible();
      expect(await listRecordFiles(id)).toEqual(filesBefore);
    } finally {
      await deleteRecord();
    }
  });

  test("내가 고쳐 다시 저장한 뒤에는, 앞선 저장을 보고 있던 상대의 저장을 거부한다", async ({ page }, testInfo) => {
    // Arrange: 내 첫 저장은 서버가 처리했지만 응답이 끊기고, 상대는 그 내용으로 화면을 연다
    const id = randomUUID();
    const title = `고쳐서 다시 ${testInfo.project.name} ${id.slice(0, 8)}`;
    const deleteRecord = await createDisposableRecord({ id, title });
    const partnerPage = await page.context().newPage();

    try {
      await openScreen(page, `/dates/${id}/edit`, getTitleField(page));
      await getTitleField(page).fill(`${title} 첫 저장`);
      await loseResponses(page, UPDATE_RECORD_URL);
      await getSubmitButton(page).tap();
      await expect(getFormAlert(page)).toContainText(RESPONSE_LOST_MESSAGE);
      await page.unroute(UPDATE_RECORD_URL);
      await openScreen(partnerPage, `/dates/${id}/edit`, getTitleField(partnerPage));
      await expect(getTitleField(partnerPage)).toHaveValue(`${title} 첫 저장`);

      // Act: 내가 내용을 고쳐 다시 저장한 뒤, 상대가 저장한다
      await getTitleField(page).fill(`${title} 내 최종`);
      await getSubmitButton(page).tap();
      await page.waitForURL(`**/dates/${id}`);
      await getTitleField(partnerPage).fill(`${title} 상대 저장`);
      await getSubmitButton(partnerPage).tap();

      // Assert: 내가 고친 내용이 그대로다
      await expect(getFormAlert(partnerPage)).toContainText(CONFLICT_MESSAGE);
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
      await page.route(UPDATE_RECORD_URL, async (route) => {
        await released;
        await route.continue();
      });
      const requested = page.waitForRequest(UPDATE_RECORD_URL);
      await getSubmitButton(page).tap();
      await requested;

      // Act
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**/dates/${id}`);
      releaseRequest();
      await page.getByRole("link", { name: "돌아가기" }).tap();
      await page.waitForURL(`**/dates/${id}/edit`);

      // Assert: 다시 저장해도 거부되므로 저장 버튼 대신 불러오기 버튼이 보인다
      await expect(page.getByRole("button", { name: "최신 내용 불러오기" })).toBeVisible();
      await expect(getSubmitButton(page)).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });
});

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
        await pickPhoto(page, 2);

        // Act
        await deleteRecord();
        await getSubmitButton(page).tap();

        // Assert
        await expect(getFormAlert(page)).toContainText("이미 지워졌어요");
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
