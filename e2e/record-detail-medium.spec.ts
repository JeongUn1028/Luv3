import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { DETAIL_MAX_EDGE, ORIGINAL_MAX_EDGE } from "@/lib/photos/limits";
import { withJpegExif } from "@/test-utils/exif-image";
import { expectImageLoaded, getKstYesterday, getSubmitButton, PICKED_PHOTO_LOCATION } from "./support/actions";
import { pickDate } from "./support/date-picker";
import { createTestName } from "./support/names";
import { createDisposableRecord, deleteRecordWithFiles, getRecordIdsByTitle, listRecordFiles } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 기록 상세 사진 칸은 긴 변 1200px 중간 크기를 받고, 크게 보기는 원본을 받는다(#411). 중간 크기가 없는 예전 사진은 칸에도 원본을 쓴다

const LARGE_WIDTH = 3000;
const LARGE_HEIGHT = 2400;

/** 서명 주소의 파일 경로 부분(`.../object/sign/album/<경로>?token=`) */
const readPhotoPath = async (photo: Locator): Promise<string> => {
  const source = (await photo.getAttribute("src")) ?? "";
  return decodeURIComponent(new URL(source).pathname).replace(/^.*\/object\/sign\/album\//, "");
};

const readNaturalSize = (photo: Locator): Promise<[number, number]> =>
  photo.evaluate((image: HTMLImageElement): [number, number] => [image.naturalWidth, image.naturalHeight]);

const getDetailPhoto = (page: Page, title: string): Locator => page.getByRole("img", { name: `${title} 사진 1`, exact: true }).locator("visible=true");
const getViewerPhoto = (page: Page, title: string): Locator =>
  page.getByRole("dialog", { name: `${title} 사진` }).getByRole("img", { name: `${title} 사진 1`, exact: true });

/** 휴대폰 사진처럼 줄이기 기준보다 큰 JPEG을 브라우저 canvas로 만들고, 고른 사진에 위치가 붙도록 EXIF를 넣는다 */
const createLargePhoto = async (page: Page): Promise<Buffer> => {
  const dataUrl = await page.evaluate(
    ({ width, height }) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("canvas를 쓸 수 없다");
      const gradient = context.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, "#f9a8d4");
      gradient.addColorStop(1, "#1e3a8a");
      context.fillStyle = gradient;
      context.fillRect(0, 0, width, height);
      return canvas.toDataURL("image/jpeg", 0.9);
    },
    { width: LARGE_WIDTH, height: LARGE_HEIGHT },
  );
  return Buffer.from(withJpegExif(PICKED_PHOTO_LOCATION, Buffer.from(dataUrl.split(",")[1] ?? "", "base64")));
};

/** 폼으로 큰 사진 한 장짜리 기록을 저장하고 그 기록 id를 돌려준다 */
const saveLargePhotoRecord = async (page: Page, title: string): Promise<string> => {
  await openScreen(page, "/dates/new", page.locator("#memo").locator("visible=true"));
  const photo = await createLargePhoto(page);
  await page.getByLabel("사진 고르기", { exact: true }).setInputFiles({ name: "large.jpg", mimeType: "image/jpeg", buffer: photo });
  await expect(page.getByRole("button", { name: /^모음 \d+의 \d+번째 사진/ }).locator("visible=true")).toHaveCount(1);
  await pickDate(page, "#date", getKstYesterday());
  await page.locator("#title").locator("visible=true").fill(title);
  await getSubmitButton(page).tap();
  await page.waitForURL(`**${RECORDS_PATH}`);
  const [id = ""] = await getRecordIdsByTitle(title);
  return id;
};

const openDetail = async (page: Page, { id, title }: { id: string; title: string }): Promise<Locator> => {
  await page.goto(`/dates/${id}`);
  const photo = getDetailPhoto(page, title);
  await expectImageLoaded(photo);
  return photo;
};

test.describe("기록 상세 사진 크기", () => {
  test("새로 올린 사진은 상세 칸에 긴 변 1200px 중간 크기를 보여 주고, 크게 보기는 원본을 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("상세 중간 크기", testInfo);

    try {
      // Act
      const id = await saveLargePhotoRecord(page, title);
      const detailPhoto = await openDetail(page, { id, title });

      // Assert: 원본·상세용·썸네일 세 파일을 올렸고, 상세 칸은 상세용이다
      const files = await listRecordFiles(id);
      expect(files).toHaveLength(3);
      const originalName = files.find((name) => !name.includes("_")) ?? "";
      expect(files.toSorted()).toEqual([originalName, originalName.replace(".jpg", "_medium.jpg"), originalName.replace(".jpg", "_thumb.jpg")].toSorted());
      expect(await readPhotoPath(detailPhoto)).toBe(`${id}/${originalName.replace(".jpg", "_medium.jpg")}`);
      expect(await readNaturalSize(detailPhoto)).toEqual([DETAIL_MAX_EDGE, (DETAIL_MAX_EDGE * LARGE_HEIGHT) / LARGE_WIDTH]);

      // Act
      await page.getByRole("button", { name: `${title} 사진 1 크게 보기` }).locator("visible=true").click();

      // Assert: 크게 보기는 확대할 수 있게 원본이다
      const viewerPhoto = getViewerPhoto(page, title);
      await expectImageLoaded(viewerPhoto);
      expect(await readPhotoPath(viewerPhoto)).toBe(`${id}/${originalName}`);
      expect(await readNaturalSize(viewerPhoto)).toEqual([ORIGINAL_MAX_EDGE, (ORIGINAL_MAX_EDGE * LARGE_HEIGHT) / LARGE_WIDTH]);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  // 상세에서 원본을 받지 않으므로, 크게 보기를 열면 원본을 새로 받는 동안 빈 화면이 되지 않게 한다
  test("크게 보기는 원본을 받는 동안 상세 칸에서 받은 중간 크기를 먼저 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("크게 보기 먼저", testInfo);

    try {
      const id = await saveLargePhotoRecord(page, title);
      const detailPhoto = await openDetail(page, { id, title });
      const mediumPath = await readPhotoPath(detailPhoto);
      const originalPath = mediumPath.replace("_medium.jpg", ".jpg");
      let releaseOriginal = (): void => undefined;
      const originalReleased = new Promise<void>((resolve) => {
        releaseOriginal = resolve;
      });
      await page.route(`**/object/sign/album/${originalPath}*`, async (route) => {
        await originalReleased;
        await route.continue();
      });

      // Act
      await page.getByRole("button", { name: `${title} 사진 1 크게 보기` }).locator("visible=true").click();

      // Assert: 원본을 기다리는 동안 상세용이 보인다
      const dialog = page.getByRole("dialog", { name: `${title} 사진` });
      const placeholder = dialog.locator(`img[src*="${mediumPath.split("/").at(-1) ?? ""}"]`);
      await expect(placeholder).toBeVisible();
      await expectImageLoaded(placeholder);

      // Act
      releaseOriginal();

      // Assert: 원본을 받으면 원본만 남는다
      const viewerPhoto = getViewerPhoto(page, title);
      await expectImageLoaded(viewerPhoto);
      await expect(viewerPhoto).toHaveCSS("opacity", "1");
      await expect(placeholder).toHaveCount(0);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });

  // 이미 올린 사진은 중간 크기를 다시 만들지 않는다
  test("중간 크기가 없는 예전 사진은 상세 칸에 원본을 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const id = randomUUID();
    const title = createTestName("예전 사진", testInfo);
    const deleteRecord = await createDisposableRecord({ id, title });

    try {
      // Act
      const detailPhoto = await openDetail(page, { id, title });

      // Assert
      const [originalName = ""] = await listRecordFiles(id);
      expect(await readPhotoPath(detailPhoto)).toBe(`${id}/${originalName}`);
    } finally {
      await deleteRecord();
    }
  });
});
