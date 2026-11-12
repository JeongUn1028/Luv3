import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { toRecordHref } from "@/lib/dates/detail";
import { createUniqueLocation, fakeMapSdk, type FakeWindow } from "./support/fake-kakao-map";
import { addRecordPhoto, createDisposableRecord, deleteFirstPhotoGroup } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

/** 위도 0.001도는 약 111m라 서로 다른 점이 된다 */
const northOf = ({ lat, lng }: { lat: number; lng: number }, step: number): { lat: number; lng: number } => ({ lat: lat + step * 0.001, lng });

const openRecord = async (page: Page, id: string, title: string): Promise<void> => {
  await openScreen(page, toRecordHref(id), page.getByRole("heading", { name: title, level: 1 }));
};

const getRouteSection = (page: Page) => page.getByRole("region", { name: "이날 다닌 곳" });

/** 좌표는 DB 응답(JSON)을 거치며 끝자리가 달라질 수 있어 소수 6자리(약 10cm)로 맞춰 비교한다 */
const roundLocation = ({ lat, lng }: { lat: number; lng: number }): string => `${lat.toFixed(6)},${lng.toFixed(6)}`;

const getPolylines = async (page: Page): Promise<{ path: string[]; strokeColor: string }[]> => {
  const polylines = await page.evaluate(() => (window as unknown as FakeWindow).fakeMap.polylines.map(({ path, strokeColor }) => ({ path, strokeColor })));
  return polylines.map(({ path, strokeColor }) => ({ path: path.map(roundLocation), strokeColor }));
};

test.describe("기록 상세 동선", () => {
  test("모음 하나를 점 하나로, 찍은 시각과 상관없이 모음 순서대로 번호를 매겨 한 줄로 잇는다", async ({ page }) => {
    // Arrange: 모음 순서와 찍은 시각 순서를 일부러 다르게 둔다. 사진을 더할 때마다 그 위치의 모음이 하나 생긴다
    const id = randomUUID();
    const title = `동선 모음 ${id.slice(0, 8)}`;
    const remove = await createDisposableRecord({ id, title });
    const start = createUniqueLocation();
    await addRecordPhoto(id, { sortOrder: 1, location: { place: "첫 모음", ...northOf(start, 2) }, takenAt: "2026-11-08T08:00:00+00:00" });
    await addRecordPhoto(id, { sortOrder: 2, location: { place: "둘째 모음", ...start }, takenAt: "2026-11-08T04:00:00+00:00" });
    await addRecordPhoto(id, { sortOrder: 3, location: { place: "셋째 모음", ...northOf(start, 1) }, takenAt: "2026-11-08T06:00:00+00:00" });
    // 만들 때 붙은 시드 모음(기본 위치)을 지워 더한 사진만 남긴다(사진은 모두 모음 위치가 있다, #297)
    await deleteFirstPhotoGroup(id);
    await fakeMapSdk(page);

    try {
      // Act
      await openRecord(page, id, title);

      // Assert
      const section = getRouteSection(page);
      await expect(section.getByText("3곳 · 모음 순서")).toBeVisible();
      await expect(section.getByRole("list", { name: "다닌 순서" }).getByRole("listitem")).toHaveText([
        "1. 첫 모음 사진 1장",
        "2. 둘째 모음 사진 1장",
        "3. 셋째 모음 사진 1장",
      ]);
      await expect(section.getByRole("list", { name: "날짜별 선 색" })).toHaveCount(0);
      await expect.poll(() => getPolylines(page)).toEqual([{ path: [northOf(start, 2), start, northOf(start, 1)].map(roundLocation), strokeColor: "#d6457a" }]);
    } finally {
      await remove();
    }
  });

  test("여러 날 기록은 날마다 다른 색으로 긋고, 다음 날 선은 전날 마지막 점에서 시작하며 날짜별 색 설명을 보여 준다", async ({ page }) => {
    // Arrange: 한국 시각 11-08 오후 두 곳, 11-09 오전·오후 두 곳
    const id = randomUUID();
    const title = `동선 여행 ${id.slice(0, 8)}`;
    const remove = await createDisposableRecord({ id, title, date: "2026-11-08", endDate: "2026-11-09" });
    const start = createUniqueLocation();
    const second = northOf(start, 1);
    const third = northOf(start, 2);
    const fourth = northOf(start, 3);
    await addRecordPhoto(id, { sortOrder: 1, location: { place: "첫날 점심", ...start }, takenAt: "2026-11-08T03:00:00+00:00" });
    await addRecordPhoto(id, { sortOrder: 2, location: { place: "첫날 저녁", ...second }, takenAt: "2026-11-08T10:00:00+00:00" });
    await addRecordPhoto(id, { sortOrder: 3, location: { place: "둘째 날 아침", ...third }, takenAt: "2026-11-09T00:30:00+00:00" });
    await addRecordPhoto(id, { sortOrder: 4, location: { place: "둘째 날 저녁", ...fourth }, takenAt: "2026-11-09T09:00:00+00:00" });
    // 만들 때 붙은 시드 모음(기본 위치)을 지워 더한 사진만 남긴다(사진은 모두 모음 위치가 있다, #297)
    await deleteFirstPhotoGroup(id);
    await fakeMapSdk(page);

    try {
      // Act
      await openRecord(page, id, title);

      // Assert
      const section = getRouteSection(page);
      await expect(section.getByRole("list", { name: "날짜별 선 색" }).getByRole("listitem")).toHaveText(["11.08 일요일", "11.09 월요일"]);
      await expect(section.getByRole("list", { name: "다닌 순서" }).getByRole("listitem")).toHaveCount(4);
      await expect
        .poll(() => getPolylines(page))
        .toEqual([
          { path: [start, second].map(roundLocation), strokeColor: "#d6457a" },
          { path: [second, third, fourth].map(roundLocation), strokeColor: "#2f6fde" },
        ]);
    } finally {
      await remove();
    }
  });

  test("첫 사진에 찍은 시각이 없는 모음이 섞이면 날짜를 나누지 않고 한 줄로 잇는다", async ({ page }) => {
    // Arrange: #249 전에 쓴 기록처럼 시각 없는 사진의 모음과, 다음 날 찍은 모음
    const id = randomUUID();
    const title = `동선 한 줄 ${id.slice(0, 8)}`;
    const remove = await createDisposableRecord({ id, title });
    const start = createUniqueLocation();
    await addRecordPhoto(id, { sortOrder: 1, location: { place: "시각 없는 곳", ...start } });
    await addRecordPhoto(id, { sortOrder: 2, location: { place: "다음 날 곳", ...northOf(start, 1) }, takenAt: "2026-11-09T01:00:00+00:00" });
    // 만들 때 붙은 시드 모음(기본 위치)을 지워 더한 사진만 남긴다(사진은 모두 모음 위치가 있다, #297)
    await deleteFirstPhotoGroup(id);
    await fakeMapSdk(page);

    try {
      // Act
      await openRecord(page, id, title);

      // Assert
      const section = getRouteSection(page);
      await expect(section.getByText("2곳 · 모음 순서")).toBeVisible();
      await expect(section.getByRole("list", { name: "다닌 순서" }).getByRole("listitem")).toHaveText(["1. 시각 없는 곳 사진 1장", "2. 다음 날 곳 사진 1장"]);
      await expect(section.getByRole("list", { name: "날짜별 선 색" })).toHaveCount(0);
      await expect.poll(() => getPolylines(page)).toEqual([{ path: [start, northOf(start, 1)].map(roundLocation), strokeColor: "#d6457a" }]);
    } finally {
      await remove();
    }
  });

  test("이틀 모두 같은 자리에서만 찍었으면 범위 대신 그 자리로 옮겨, 지도가 가장 크게 확대되지 않는다", async ({ page }) => {
    // Arrange: 날이 바뀌면 같은 자리여도 점을 합치지 않아 점이 둘이지만 좌표는 같다
    const id = randomUUID();
    const title = `동선 같은 자리 ${id.slice(0, 8)}`;
    const remove = await createDisposableRecord({ id, title, date: "2026-11-08", endDate: "2026-11-09" });
    const location = createUniqueLocation();
    await addRecordPhoto(id, { sortOrder: 1, location: { place: "숙소", ...location }, takenAt: "2026-11-08T12:00:00+00:00" });
    await addRecordPhoto(id, { sortOrder: 2, location: { place: "숙소", ...location }, takenAt: "2026-11-09T00:00:00+00:00" });
    // 만들 때 붙은 시드 모음(기본 위치)을 지워 더한 사진만 남긴다(사진은 모두 모음 위치가 있다, #297)
    await deleteFirstPhotoGroup(id);
    await fakeMapSdk(page);

    try {
      // Act
      await openRecord(page, id, title);

      // Assert
      await expect(getRouteSection(page).getByRole("list", { name: "다닌 순서" }).getByRole("listitem")).toHaveCount(2);
      await expect
        .poll(() => page.evaluate(() => (({ boundsCount, centerCount }) => ({ boundsCount, centerCount }))((window as unknown as FakeWindow).fakeMap)))
        .toEqual({ boundsCount: 0, centerCount: 1 });
    } finally {
      await remove();
    }
  });

  test("위치가 있는 사진이 한 곳뿐이면 동선 지도를 그리지 않고 지도도 불러오지 않는다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const title = `동선 없음 ${id.slice(0, 8)}`;
    const remove = await createDisposableRecord({ id, title });
    await addRecordPhoto(id, { sortOrder: 1, location: { place: "한 곳", ...createUniqueLocation() } });
    await deleteFirstPhotoGroup(id);
    const sdkUrls = await fakeMapSdk(page);

    try {
      // Act
      await openRecord(page, id, title);

      // Assert
      await expect(getRouteSection(page)).toHaveCount(0);
      expect(sdkUrls).toEqual([]);
    } finally {
      await remove();
    }
  });
});
