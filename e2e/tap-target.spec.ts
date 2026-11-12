import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Locator } from "@playwright/test";
import { PHOTO_FIXTURE_PATH } from "./support/constants";
import { createDisposableRecord, setRecordTags } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const TAP_TARGET_SIZE = 44;

/**
 * 요소 가운데에서 44px 네모의 네 변 안쪽을 눌렀을 때 그 요소가 눌리는지 잰다.
 * 보이는 크기는 작아도 가상 요소로 넓힌 영역까지 재려고 크기 대신 그 자리의 요소를 본다.
 * 브라우저가 좌표를 정수로 반올림해 재므로 끝 칸(±22)이 아닌 그 안쪽 칸(±21)을 누른다.
 */
const getMissedPoints = async (target: Locator): Promise<string[]> => {
  // 화면 밖 좌표는 누름 영역과 상관없이 놓친 것으로 나오므로 먼저 화면 안으로 옮긴다
  await target.scrollIntoViewIfNeeded();
  return target.evaluate((element, size) => {
    const { left, top, width, height } = element.getBoundingClientRect();
    const centerX = left + width / 2;
    const centerY = top + height / 2;
    const reach = size / 2 - 1;
    const points = [
      ["왼쪽", centerX - reach, centerY],
      ["오른쪽", centerX + reach, centerY],
      ["위", centerX, centerY - reach],
      ["아래", centerX, centerY + reach],
    ] as const;
    return points.flatMap(([name, x, y]) => {
      const hit = document.elementFromPoint(x, y);
      return hit && element.contains(hit) ? [] : [name];
    });
  }, TAP_TARGET_SIZE);
};

test.describe("누름 영역", () => {
  test("기록 작성의 태그 추가와 한 글자 태그 버튼도 44px 영역을 눌러도 눌린다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 한 글자 태그" });
    await setRecordTags(id, ["집"]);

    try {
      await openScreen(page, "/dates/new", page.locator("#memo"));

      // Act & Assert: 태그 추가
      const openButton = page.getByRole("button", { name: "태그 추가" });
      expect(await getMissedPoints(openButton)).toEqual([]);

      // Act & Assert: 전에 쓴 태그
      await openButton.click();
      expect(await getMissedPoints(page.getByRole("button", { name: "집 태그 붙이기" }))).toEqual([]);

      // Act & Assert: 붙인 태그
      await page.locator("#tag-input").fill("숲");
      await page.getByRole("button", { name: "추가", exact: true }).click();
      expect(await getMissedPoints(page.getByRole("button", { name: "숲 태그 빼기" }))).toEqual([]);
    } finally {
      await deleteRecord();
    }
  });

  test("기록 찾기의 돋보기와 태그 줄, 상세의 태그는 44px 영역을 눌러도 눌린다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 찾기 누름" });
    await setRecordTags(id, ["책"]);

    try {
      await openScreen(page, "/records", page.getByRole("button", { name: "기록 찾기" }));

      // Act & Assert: 돋보기
      const searchButton = page.getByRole("button", { name: "기록 찾기" });
      expect(await getMissedPoints(searchButton)).toEqual([]);

      // Act & Assert: 고르지 않은 태그와 고른 태그
      await searchButton.click();
      const tagButton = page.getByRole("button", { name: "책", exact: true });
      expect(await getMissedPoints(tagButton)).toEqual([]);
      await tagButton.click();
      await expect(tagButton).toHaveAttribute("aria-pressed", "true");
      expect(await getMissedPoints(tagButton)).toEqual([]);

      // Act & Assert: 상세의 태그
      await openScreen(page, `/dates/${id}`, page.getByRole("list", { name: "태그" }));
      expect(await getMissedPoints(page.getByRole("link", { name: "책" }))).toEqual([]);
    } finally {
      await deleteRecord();
    }
  });

  test("기록 작성의 모음 카드 버튼과 장소 이름·한마디 칸은 44px 영역을 눌러도 눌리고 서로 겹치지 않는다", async ({ page }) => {
    // Arrange: 앞으로·뒤로 버튼이 모두 켜지도록 사진 3장을 한 모음으로 고르고 가운데 사진을 누른다
    await openScreen(page, "/dates/new", page.locator("#memo"));
    const photo = { name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO_FIXTURE_PATH) };
    await page.getByLabel("사진 고르기", { exact: true }).setInputFiles([photo, { ...photo, name: "photo-2.jpg" }, { ...photo, name: "photo-3.jpg" }]);
    const card = page.getByRole("listitem", { name: /^모음 1/ });
    await card.getByRole("button", { name: /^모음 1의 2번째 사진/ }).click();

    // Act
    const missed = {
      위로: await getMissedPoints(card.getByRole("button", { name: "모음 1 위로 옮기기" })),
      아래로: await getMissedPoints(card.getByRole("button", { name: "모음 1 아래로 옮기기" })),
      모음빼기: await getMissedPoints(card.getByRole("button", { name: "모음 1 빼기" })),
      위치: await getMissedPoints(card.getByRole("button", { name: /\(모음 1\)$/ })),
      사진더하기: await getMissedPoints(card.getByRole("button", { name: /이 모음에 사진 더하기/ })),
      대표로: await getMissedPoints(card.getByRole("button", { name: "대표로" })),
      앞으로: await getMissedPoints(card.getByRole("button", { name: "앞으로" })),
      뒤로: await getMissedPoints(card.getByRole("button", { name: "뒤로" })),
      빼기: await getMissedPoints(card.getByRole("button", { name: "이 사진 빼기" })),
    };

    // Assert
    expect(missed).toEqual({ 위로: [], 아래로: [], 모음빼기: [], 위치: [], 사진더하기: [], 대표로: [], 앞으로: [], 뒤로: [], 빼기: [] });
    const caption = await card.getByRole("textbox", { name: /^한마디/ }).boundingBox();
    expect(caption?.height).toBeGreaterThanOrEqual(TAP_TARGET_SIZE);
    const placeName = await card.getByRole("textbox", { name: /^장소 이름/ }).boundingBox();
    expect(placeName?.height).toBeGreaterThanOrEqual(TAP_TARGET_SIZE);
  });

  test("하고 싶은 것의 위로·아래로 버튼은 44px 영역을 눌러도 눌린다", async ({ page }) => {
    await openScreen(page, "/todos", page.getByRole("button", { name: /아래로/ }).first());

    const down = page.getByRole("button", { name: /아래로/ }).first();
    const up = page.getByRole("button", { name: /위로/ }).nth(1);

    expect({ 위로: await getMissedPoints(up), 아래로: await getMissedPoints(down) }).toEqual({ 위로: [], 아래로: [] });
  });

  test("홈의 커플 사진 바꾸기 버튼은 44px 영역을 눌러도 눌린다", async ({ page }) => {
    const change = page.getByRole("button", { name: "커플 사진 바꾸기" }).locator("visible=true").first();
    await openScreen(page, "/", change);

    expect(await getMissedPoints(change)).toEqual([]);
  });
});
