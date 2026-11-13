import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { toRecordHref, toRecordPhotoHref } from "@/lib/dates/detail";
import { expectImageLoaded } from "./support/actions";
import { createUniqueLocation, fakeMapSdk } from "./support/fake-kakao-map";
import { addRecordPhoto, createDisposableRecord, getRecordPhotoDetails, setRecordSearchFields } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 기록 상세 첫 화면 받는 순서(#313). 첫 사진이 먼저이고, 동선 지도는 화면에 가까워지고 첫 사진을 받은 뒤, 넘길 사진은 앞뒤 한 장씩 미리 받는다

/** 이 기록 사진 파일의 서명 주소 요청 */
const isRecordPhotoRequest = (recordId: string) => (url: URL) => url.pathname.includes("/storage/v1/object/sign/") && url.pathname.includes(recordId);

const isThumbRequest = (url: URL): boolean => url.pathname.endsWith("-thumb.jpg");

const getRouteSection = (page: Page): Locator => page.getByRole("region", { name: "이날 다닌 곳" });

/**
 * 서버가 그린 요소에 화면이 연결될 때까지(하이드레이션) 기다린다. 연결되기 전에는 effect가 돌지 않아,
 * "지도를 아직 부르지 않는다"를 재면 기다리는 조건이 없어도 통과한다
 */
const waitForHydration = (locator: Locator): Promise<void> =>
  expect.poll(() => locator.evaluate((element) => Object.keys(element).some((key) => key.startsWith("__reactFiber")))).toBe(true);

/** 붙잡아 둔 요청을 풀어 주는 함수와 함께, 조건에 맞는 사진 요청을 붙잡는다 */
const holdRequests = async (page: Page, matches: (url: URL) => boolean): Promise<() => void> => {
  let release = (): void => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(matches, async (route) => {
    await released;
    await route.continue();
  });
  return release;
};

/** 동선이 생기는 기록(시드 모음 + 다른 곳 모음 하나)을 만든다 */
const createRouteRecord = async (label: string): Promise<{ id: string; title: string; remove: () => Promise<void> }> => {
  const id = randomUUID();
  const title = `${label} ${id.slice(0, 8)}`;
  const remove = await createDisposableRecord({ id, title });
  await addRecordPhoto(id, { sortOrder: 1, location: { place: "두 번째 곳", ...createUniqueLocation() } });
  return { id, title, remove };
};

test.describe("기록 상세 받는 순서", () => {
  test("첫 사진을 다 받기 전에는 동선 지도를 불러오지 않고, 받은 뒤에 불러온다", async ({ page }) => {
    // Arrange: 글이 짧아 동선 지도가 처음부터 화면 안에 들어오는 기록
    const { id, title, remove } = await createRouteRecord("받는 순서 지도");
    const sdkUrls = await fakeMapSdk(page);
    const release = await holdRequests(page, isRecordPhotoRequest(id));

    try {
      // Act: 붙잡은 사진 때문에 load가 오지 않으므로 응답이 오기 시작하면 넘어간다
      await page.goto(toRecordHref(id), { waitUntil: "commit" });
      await page.getByRole("heading", { name: title, level: 1 }).waitFor();
      await expect(getRouteSection(page)).toBeInViewport();
      await waitForHydration(getRouteSection(page));
      // 연결된 뒤 지도를 불러올 만큼 기다린다. 첫 사진을 못 받았을 때 대신 불러오는 시간(4초)보다는 짧다
      await page.waitForTimeout(1_000);

      // Assert: 화면 안에 있어도 첫 사진을 받는 동안은 지도를 부르지 않는다
      expect(sdkUrls).toEqual([]);

      // Act
      release();

      // Assert
      await expect.poll(() => sdkUrls.length).toBe(1);
    } finally {
      release();
      await remove();
    }
  });

  test("동선 지도가 화면에서 멀면 불러오지 않고, 가까이 내리면 불러온다", async ({ page }) => {
    // Arrange: 긴 글로 동선 지도를 화면 아래 멀리 민다
    const { id, title, remove } = await createRouteRecord("받는 순서 먼 지도");
    await setRecordSearchFields(id, { memo: Array.from({ length: 60 }, (_, line) => `${line + 1}번째 줄`).join("\n"), caption: "" });
    const sdkUrls = await fakeMapSdk(page);

    try {
      // Act
      await openScreen(page, toRecordHref(id), page.getByRole("heading", { name: title, level: 1 }));
      await expectImageLoaded(page.getByRole("img", { name: `${title} 사진 1` }));

      // Assert
      await expect(getRouteSection(page)).not.toBeInViewport();
      expect(sdkUrls).toEqual([]);

      // Act
      await getRouteSection(page).scrollIntoViewIfNeeded();

      // Assert
      await expect.poll(() => sdkUrls.length).toBe(1);
    } finally {
      await remove();
    }
  });

  test("처음 펼친 사진은 원본을 받는 동안 썸네일을 먼저 보여 주고, 원본을 받으면 원본으로 바꾼다", async ({ page }) => {
    // Arrange: 원본과 썸네일 파일이 다른 사진부터 펼친다. 원본 요청만 붙잡는다
    const id = randomUUID();
    const title = `받는 순서 썸네일 ${id.slice(0, 8)}`;
    const remove = await createDisposableRecord({ id, title });
    const photoId = await addRecordPhoto(id, { sortOrder: 1, hasSeparateThumb: true });
    const release = await holdRequests(page, (url) => isRecordPhotoRequest(id)(url) && !isThumbRequest(url));
    const photo = page.getByRole("img", { name: `${title} 사진 2` });
    const frame = photo.locator("..");

    try {
      // Act
      await page.goto(toRecordPhotoHref({ recordId: id, photoId }), { waitUntil: "commit" });
      await page.getByRole("heading", { name: title, level: 1 }).waitFor();

      // Assert: 원본은 숨겨 둔 채 썸네일이 칸을 채운다
      const thumb = frame.locator('img[src*="-thumb.jpg"]');
      await expectImageLoaded(thumb);
      await expect(thumb).toHaveCSS("opacity", "1");
      await expect(photo).toHaveCSS("opacity", "0");
      await expect(frame).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

      // Act
      release();

      // Assert: 원본을 받으면 썸네일은 사라진다
      await expectImageLoaded(photo);
      await expect(photo).toHaveCSS("opacity", "1");
      await expect(thumb).toHaveCount(0);
    } finally {
      release();
      await remove();
    }
  });

  test("지금 사진을 다 받으면 앞뒤 한 장만 미리 받고, 넘기면 그다음 한 장을 받는다", async ({ page }) => {
    // Arrange: 사진 4장. 원본과 썸네일이 같은 파일이라 사진마다 요청은 하나다
    const id = randomUUID();
    const title = `받는 순서 미리 받기 ${id.slice(0, 8)}`;
    const remove = await createDisposableRecord({ id, title });
    for (const sortOrder of [1, 2, 3]) await addRecordPhoto(id, { sortOrder });
    const paths = (await getRecordPhotoDetails(id)).map(({ path }) => path);
    const requestedPaths = new Set<string>();
    page.on("request", (request) => {
      const requested = paths.find((path) => new URL(request.url()).pathname.endsWith(path));
      if (requested) requestedPaths.add(requested);
    });
    const isRequested = (index: number): boolean => requestedPaths.has(paths[index] ?? "");

    try {
      // Act
      await openScreen(page, toRecordHref(id), page.getByRole("heading", { name: title, level: 1 }));
      await expectImageLoaded(page.getByRole("img", { name: `${title} 사진 1` }));

      // Assert: 다음 한 장만 받고 그 뒤는 받지 않는다
      await expect.poll(() => isRequested(1)).toBe(true);
      expect([isRequested(2), isRequested(3)]).toEqual([false, false]);

      // Act
      await page.getByRole("button", { name: "다음 사진" }).click();

      // Assert
      await expect.poll(() => isRequested(2)).toBe(true);
      expect(isRequested(3)).toBe(false);
    } finally {
      await remove();
    }
  });

  test("미리 받던 사진을 다 받기 전에 멀리 넘겨도 받기를 끊지 않는다", async ({ page }) => {
    // Arrange: 사진 5장. 2번째 사진 요청만 붙잡아, 미리 받는 중인 채로 4번째 사진까지 넘긴다
    const id = randomUUID();
    const title = `받는 순서 끊지 않기 ${id.slice(0, 8)}`;
    const remove = await createDisposableRecord({ id, title });
    for (const sortOrder of [1, 2, 3, 4]) await addRecordPhoto(id, { sortOrder });
    const secondPath = (await getRecordPhotoDetails(id))[1]?.path ?? "";
    const release = await holdRequests(page, (url) => url.pathname.endsWith(secondPath));
    const second = page.getByRole("img", { name: `${title} 사진 2` });

    try {
      // 붙잡은 요청 때문에 네트워크가 조용해지지 않아 openScreen 대신 제목만 기다린다
      await page.goto(toRecordHref(id), { waitUntil: "commit" });
      await page.getByRole("heading", { name: title, level: 1 }).waitFor();
      await expectImageLoaded(page.getByRole("img", { name: `${title} 사진 1` }));
      await expect(second).toHaveCount(1);

      // Act
      for (const position of ["2 / 5", "3 / 5", "4 / 5"]) {
        await page.getByRole("button", { name: "다음 사진" }).click();
        await expect(page.getByText(position)).toBeVisible();
      }

      // Assert: 멀리 넘겨도 2번째 사진 요소가 남아, 붙잡은 요청을 놓아주면 그대로 받는다
      await expect(second).toHaveCount(1);
      release();
      await expectImageLoaded(second);
    } finally {
      release();
      await remove();
    }
  });
});
