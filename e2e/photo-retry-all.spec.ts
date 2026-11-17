import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { expectImageLoaded } from "./support/actions";
import { createDisposableRecord } from "./support/seed";
import { expect, test } from "./support/test";
import { createTestName } from "./support/names";

const PHOTO_COUNT = 3;

interface TestPhotoRecord {
  id: string;
  title: string;
}

const createPhotoRecords = async (label: string, projectName: string): Promise<{ records: TestPhotoRecord[]; remove: () => Promise<void> }> => {
  const records = Array.from({ length: PHOTO_COUNT }, (_, index) => ({
    id: randomUUID(),
    title: createTestName(`${label} ${index}`, { project: { name: projectName } }),
  }));
  const removers = await Promise.all(records.map((record) => createDisposableRecord(record)));
  return { records, remove: async () => void (await Promise.all(removers.map((remove) => remove()))) };
};

const findRecordId = (records: TestPhotoRecord[], route: Route): string | undefined =>
  records.find(({ id }) => route.request().url().includes(id))?.id;

const getPhoto = (page: Page, title: string): Locator => page.getByRole("img", { name: title }).locator("visible=true");

const expectAllLoaded = async (page: Page, records: TestPhotoRecord[]): Promise<void> => {
  for (const { title } of records) {
    const photo = getPhoto(page, title);
    await photo.scrollIntoViewIfNeeded();
    await expectImageLoaded(photo);
  }
};

test("여러 사진이 한꺼번에 깨져도 화면을 새로 받으면 모두 다시 받는다", async ({ page }, testInfo) => {
  // Arrange: 만료된 주소처럼 기록마다 첫 요청만 거절한다
  const { records, remove } = await createPhotoRecords("E2E 모두 다시", testInfo.project.name);
  const failedIds = new Set<string>();
  await page.route("**/storage/v1/object/sign/**", (route) => {
    const id = findRecordId(records, route);
    if (id !== undefined && !failedIds.has(id)) {
      failedIds.add(id);
      return route.fulfill({ status: 400, json: { statusCode: "400", error: "InvalidJWT", message: '"exp" claim timestamp check failed' } });
    }
    return route.continue();
  });

  try {
    // Act
    await page.goto(RECORDS_PATH);

    // Assert
    await expectAllLoaded(page, records);
    expect(failedIds.size).toBe(PHOTO_COUNT);
  } finally {
    await remove();
  }
});

test("끊긴 채 깨진 사진은 다시 연결되면 모두 다시 받는다", async ({ page, context }, testInfo) => {
  // Arrange: 사진 요청을 붙잡아 두고, 끊긴 뒤에 실패로 돌려준다
  const { records, remove } = await createPhotoRecords("E2E 다시 연결", testInfo.project.name);
  const heldRoutes: Route[] = [];
  let isDisconnected = true;
  await page.route("**/storage/v1/object/sign/**", (route) => {
    if (isDisconnected && findRecordId(records, route) !== undefined) {
      heldRoutes.push(route);
      return;
    }
    return route.continue();
  });

  try {
    await page.goto(RECORDS_PATH);
    await expect.poll(() => heldRoutes.length).toBe(PHOTO_COUNT);
    await context.setOffline(true);
    await Promise.all(heldRoutes.map((route) => route.abort("internetdisconnected")));
    for (const { title } of records) {
      await expect.poll(() => getPhoto(page, title).evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth === 0)).toBe(true);
    }

    // Act
    isDisconnected = false;
    await context.setOffline(false);

    // Assert
    await expectAllLoaded(page, records);
  } finally {
    await context.setOffline(false);
    await remove();
  }
});
