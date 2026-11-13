import type { Page, Request, Route } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { IMAGE_COMPRESSION_LIB_PATH } from "@/lib/photos/compression-lib";
import { UPLOAD_CONCURRENCY } from "@/lib/photos/upload";
import { getKstYesterday, getSubmitButton, pickPhoto } from "./support/actions";
import { pickDate } from "./support/date-picker";
import { createTestName } from "./support/names";
import { deleteRecordWithFiles, getRecordIdsByTitle, listRecordFiles } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 사진을 줄이는 대로 올리고 동시에 몇 장씩 올리는 저장(#312)의 진행 표시·웹 워커 줄이기·실패 정리

const ALBUM_UPLOAD_URL = "**/storage/v1/object/album/**";
const CREATE_RECORD_URL = "**/rest/v1/rpc/create_date_record";

const isUpload = (request: Request): boolean => request.method() === "POST";

/** 올리는 파일 경로의 마지막 조각(`<사진 id>.jpg`, `<사진 id>_thumb.jpg`) */
const toFileName = (request: Request): string => new URL(request.url()).pathname.split("/").at(-1) ?? "";

/** 올린 파일이 속한 기록 id(경로의 `album/<기록 id>/...`) */
const toRecordId = (request: Request): string => new URL(request.url()).pathname.split("/").at(-2) ?? "";

const fillNewRecord = async (page: Page, { title, photoCount }: { title: string; photoCount: number }): Promise<void> => {
  await openScreen(page, "/dates/new", page.locator("#memo").locator("visible=true"));
  for (let order = 1; order <= photoCount; order += 1) await pickPhoto(page, order);
  // 오늘 날짜면 나란히 도는 홈 테스트의 "최근 기록" 자리를 잠깐 차지하므로 어제로 둔다
  await pickDate(page, "#date", getKstYesterday());
  await page.locator("#title").locator("visible=true").fill(title);
};

/** 사진 파일 올리기를 테스트가 하나씩 풀어 줄 때까지 붙잡는다 */
const holdUploads = async (page: Page) => {
  const pending: Route[] = [];
  let isHolding = true;
  await page.route(ALBUM_UPLOAD_URL, (route) => {
    if (!isUpload(route.request()) || !isHolding) return route.continue();
    pending.push(route);
    return undefined;
  });
  return {
    pendingNames: () => pending.map((route) => toFileName(route.request())),
    release: async (name: string) => {
      const index = pending.findIndex((route) => toFileName(route.request()) === name);
      const [route] = pending.splice(index, 1);
      if (!route) throw new Error(`붙잡은 올리기가 없다: ${name}`);
      await route.continue();
    },
    releaseAll: async () => {
      isHolding = false;
      for (const route of pending.splice(0)) await route.continue();
    },
  };
};

test.describe("사진이 있는 기록 저장", () => {
  test(`사진을 올리는 동안 저장 버튼은 다 올린 장수를 보여 주고 누를 수 없으며, 동시에 ${UPLOAD_CONCURRENCY}장까지만 올린다`, async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("올리는 중 표시", testInfo);
    const photoCount = UPLOAD_CONCURRENCY + 1;
    await fillNewRecord(page, { title, photoCount });
    const uploads = await holdUploads(page);
    let releaseSave = (): void => undefined;
    const saveReleased = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    await page.route(CREATE_RECORD_URL, async (route) => {
      await saveReleased;
      await route.continue();
    });
    const button = getSubmitButton(page);

    try {
      // Act
      await button.tap();

      // Assert: 한 장도 다 올리지 않았고, 세 장의 원본만 올리는 중이다(넷째 장은 자리가 날 때까지 기다린다)
      await expect(button).toHaveText(`사진 올리는 중… 0/${photoCount}`);
      await expect(button).toBeDisabled();
      await expect.poll(() => uploads.pendingNames()).toHaveLength(UPLOAD_CONCURRENCY);
      expect(uploads.pendingNames().every((name) => !name.includes("_thumb"))).toBe(true);

      // Act: 첫 사진의 원본과 썸네일을 올린다
      const [firstOriginal = ""] = uploads.pendingNames();
      await uploads.release(firstOriginal);
      const firstThumb = firstOriginal.replace(".jpg", "_thumb.jpg");
      await expect.poll(() => uploads.pendingNames()).toContain(firstThumb);
      await uploads.release(firstThumb);

      // Assert
      await expect(button).toHaveText(`사진 올리는 중… 1/${photoCount}`);

      // Act: 나머지를 다 올린다
      await uploads.releaseAll();

      // Assert: 기록을 저장하는 동안에도 누를 수 없다
      await expect(button).toHaveText("기록 저장 중…");
      await expect(button).toBeDisabled();

      releaseSave();
      await page.waitForURL(`**${RECORDS_PATH}`);
      const [savedId = ""] = await getRecordIdsByTitle(title);
      expect(await listRecordFiles(savedId)).toHaveLength(photoCount * 2);
    } finally {
      releaseSave();
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("사진을 줄이는 웹 워커는 우리 주소의 라이브러리 사본을 받고, 외부 CDN은 부르지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("워커로 줄이기", testInfo);
    await fillNewRecord(page, { title, photoCount: 1 });
    const requestedUrls: string[] = [];
    page.on("request", (request) => requestedUrls.push(request.url()));
    const workerStarted = page.waitForEvent("worker");
    const libraryLoaded = page.waitForResponse((response) => new URL(response.url()).pathname === IMAGE_COMPRESSION_LIB_PATH);

    try {
      // Act
      await getSubmitButton(page).tap();

      // Assert
      await workerStarted;
      expect((await libraryLoaded).ok()).toBe(true);
      await page.waitForURL(`**${RECORDS_PATH}`);
      expect(requestedUrls.filter((url) => url.includes("cdn.jsdelivr.net"))).toEqual([]);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  test("사진 하나를 끝내 올리지 못하면 이번에 올린 사진 파일을 모두 지우고, 다시 저장할 수 있다", async ({ page }, testInfo) => {
    // Arrange: 둘째로 올리기 시작한 원본은 다시 보내도 실패한다
    const title = createTestName("올리기 실패 정리", testInfo);
    const photoCount = 3;
    await fillNewRecord(page, { title, photoCount });
    const originals: string[] = [];
    let recordId = "";
    await page.route(ALBUM_UPLOAD_URL, async (route) => {
      const request = route.request();
      if (!isUpload(request)) return route.continue();
      recordId = toRecordId(request);
      const name = toFileName(request);
      if (!name.includes("_thumb") && !originals.includes(name)) originals.push(name);
      if (name === originals[1]) return route.abort("connectionreset");
      return route.continue();
    });

    try {
      // Act
      await getSubmitButton(page).tap();

      // Assert: 실패를 알리고, 이번에 올린 파일이 하나도 남지 않으며, 기록도 만들지 않는다
      await expect(page.locator("main").getByRole("alert").locator("visible=true")).toContainText("사진을 올리지 못했어요");
      await expect.poll(() => listRecordFiles(recordId)).toEqual([]);
      expect(await getRecordIdsByTitle(title)).toEqual([]);

      // Act: 회선이 돌아와 다시 저장한다
      await page.unroute(ALBUM_UPLOAD_URL);
      await getSubmitButton(page).tap();

      // Assert
      await page.waitForURL(`**${RECORDS_PATH}`);
      const [savedId = ""] = await getRecordIdsByTitle(title);
      expect(await listRecordFiles(savedId)).toHaveLength(photoCount * 2);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });
});
