import type { Locator, Page } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { HOME_PATH } from "@/lib/auth/paths";
import { expectImageLoaded, getGroupPhoto, getKstYesterday, getSaveButton, getTab, getVisibleLink, pickPhoto } from "./support/actions";
import { pickDate } from "./support/date-picker";
import { createTestName } from "./support/names";
import { deleteRecordWithFiles, getRecordCoverPhotoIndex, getRecordGroupCaptions, getRecordIdsByTitle } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const NEW_RECORD_PATH = "/dates/new";

/** 모음 1의 사진 줄 미리보기 */
const getPreview = (page: Page, order: number): Locator => getGroupPhoto(page, 1, order).locator("img");
/** 모음 1의 한마디 칸(#309) */
const getCaption = (page: Page): Locator => page.getByRole("textbox", { name: "한마디 (모음 1) (선택)" }).locator("visible=true");

/** 기록 목록에서 새 기록 폼을 연다. 다녀온 뒤에도 같은 길로 열어야 숨겨 둔 폼(Activity)이 다시 보인다 */
const openNewRecordFromRecords = async (page: Page): Promise<void> => {
  await getVisibleLink(page, NEW_RECORD_PATH).tap();
  await page.waitForURL(`**${NEW_RECORD_PATH}`);
};

test.describe("사진을 고른 새 기록 폼을 두고 다른 탭에 다녀오면", () => {
  test("미리보기가 그대로 보이고, 순서를 바꿔 저장하면 바꾼 순서로 저장된다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("E2E 다녀온 미리보기", testInfo);
    await openScreen(page, RECORDS_PATH, getVisibleLink(page, NEW_RECORD_PATH));
    await openNewRecordFromRecords(page);
    await pickPhoto(page, 1);
    await pickPhoto(page, 2, { groupNumber: 1 });
    await getCaption(page).fill("다녀와도 남는 한마디");
    await expectImageLoaded(getPreview(page, 1));
    await expectImageLoaded(getPreview(page, 2));

    try {
      // Act: 다른 탭에 다녀와 숨겨 둔 폼을 다시 연다. 폼에는 하단 탭이 없어 iOS 가장자리 밀기처럼 뒤로 가기로 목록에 나간다
      // (머리글 뒤로 버튼은 버릴지 묻는다)
      await page.goBack();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await getTab(page, HOME_PATH).tap();
      await page.waitForURL(`**${HOME_PATH}`);
      await getTab(page, RECORDS_PATH).tap();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await openNewRecordFromRecords(page);

      // Assert: 고른 사진과 한마디가 남아 있고 미리보기가 깨지지 않았다. 처음 고른 사진이 대표다
      await expect(getCaption(page)).toHaveValue("다녀와도 남는 한마디");
      await expect(getGroupPhoto(page, 1, 1)).toHaveAccessibleName("모음 1의 1번째 사진 (대표)");
      await expectImageLoaded(getPreview(page, 1));
      await expectImageLoaded(getPreview(page, 2));

      // Act: 첫 사진(대표)을 뒤로 옮긴다
      await getGroupPhoto(page, 1, 1).tap();
      await page.getByRole("button", { name: "뒤로", exact: true }).locator("visible=true").tap();

      // Assert: 옮긴 사진이 2번째가 되고 미리보기가 깨지지 않았다
      await expect(getGroupPhoto(page, 1, 2)).toHaveAccessibleName("모음 1의 2번째 사진 (대표)");
      await expectImageLoaded(getPreview(page, 1));
      await expectImageLoaded(getPreview(page, 2));
      await expect(page.getByText("미리보기 없음").locator("visible=true")).toHaveCount(0);

      // Act: 저장한다. 오늘 날짜면 나란히 도는 홈 테스트의 "최근 기록" 자리를 잠깐 차지하므로 어제로 둔다
      await pickDate(page, "#date", getKstYesterday());
      await page.locator("#title").locator("visible=true").fill(title);
      await getSaveButton(page).tap();
      await page.waitForURL(`**${RECORDS_PATH}`);

      // Assert: 두 장 모두 바꾼 순서로(대표가 2번째로), 한마디와 함께 저장됐다
      const [recordId] = await getRecordIdsByTitle(title);
      if (!recordId) throw new Error("저장한 기록을 찾지 못했습니다");
      expect(await getRecordCoverPhotoIndex(recordId)).toBe(1);
      expect(await getRecordGroupCaptions(recordId)).toEqual(["다녀와도 남는 한마디"]);
    } finally {
      for (const id of await getRecordIdsByTitle(title)) await deleteRecordWithFiles(id);
    }
  });
});
