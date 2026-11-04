import { readFileSync } from "node:fs";
import type { Locator } from "@playwright/test";
import { PHOTO_FIXTURE_PATH } from "./support/constants";
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
  test("기록 작성의 사진 칸 버튼과 한마디 칸은 44px 영역을 눌러도 눌리고 서로 겹치지 않는다", async ({ page }) => {
    // Arrange: 앞으로·뒤로 버튼이 모두 켜지도록 사진 3장을 고른다
    await openScreen(page, "/dates/new", page.locator("#memo"));
    const photo = { name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO_FIXTURE_PATH) };
    await page.getByLabel("사진 고르기").setInputFiles([photo, { ...photo, name: "photo-2.jpg" }, { ...photo, name: "photo-3.jpg" }]);
    await page.getByRole("button", { name: "3번째 사진 빼기" }).waitFor();
    const row = page.locator("ol > li").nth(1);

    // Act
    const missed = {
      앞으로: await getMissedPoints(row.getByRole("button", { name: "2번째 사진을 앞으로" })),
      뒤로: await getMissedPoints(row.getByRole("button", { name: "2번째 사진을 뒤로" })),
      빼기: await getMissedPoints(row.getByRole("button", { name: "2번째 사진 빼기" })),
      대표: await getMissedPoints(row.locator("label", { hasText: "대표" })),
    };

    // Assert
    expect(missed).toEqual({ 앞으로: [], 뒤로: [], 빼기: [], 대표: [] });
    const caption = await row.getByRole("textbox").boundingBox();
    expect(caption?.height).toBeGreaterThanOrEqual(TAP_TARGET_SIZE);
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
