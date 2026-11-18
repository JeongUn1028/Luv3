import { randomUUID } from "node:crypto";
import { createDisposableRecord, setRecordSearchFields, setRecordTags } from "./support/seed";
import { expect, getScrollArea, openScreen, test } from "./support/test";

/** 화면보다 긴 정리 글. 마지막 줄이 보이면 끝까지 내린 것이다 */
const LONG_MEMO = Array.from({ length: 60 }, (_, line) => `${line + 1}번째 줄`).join("\n");

// 긴 글과 댓글을 읽어 내려가도 뒤로·수정·삭제를 쓸 수 있게 머리글을 위에 붙여 둔다(#349)
test.describe("기록 상세 머리글", () => {
  test("긴 글을 끝까지 내려도 뒤로·고치기·지우기 버튼이 처음 자리에 남는다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: `E2E 긴 글 ${id.slice(0, 6)}` });
    await setRecordSearchFields(id, { memo: LONG_MEMO, caption: "" });

    try {
      const editLink = page.getByRole("link", { name: "고치기" });
      await openScreen(page, `/dates/${id}`, editLink);
      const buttons = [page.getByRole("link", { name: "뒤로" }), editLink, page.getByRole("button", { name: "지우기" })];
      const topsBefore = await Promise.all(buttons.map(async (button) => (await button.boundingBox())?.y));

      // Act
      await getScrollArea(page).evaluate((area) => area.scrollTo({ top: area.scrollHeight }));
      await expect(page.getByText("60번째 줄")).toBeInViewport();

      // Assert
      for (const [index, button] of buttons.entries()) {
        await expect(button).toBeInViewport();
        expect((await button.boundingBox())?.y).toBe(topsBefore[index]);
      }
    } finally {
      await deleteRecord();
    }
  });

  test("아래에서 위로 초점을 옮겨도 초점 받은 칸이 머리글 밑에 가려지지 않는다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const tag = `가림${id.slice(0, 4)}`;
    const deleteRecord = await createDisposableRecord({ id, title: `E2E 초점 ${id.slice(0, 6)}` });
    await setRecordSearchFields(id, { memo: LONG_MEMO, caption: "" });
    await setRecordTags(id, [tag]);

    try {
      await openScreen(page, `/dates/${id}`, page.getByRole("link", { name: "고치기" }));
      await getScrollArea(page).evaluate((area) => area.scrollTo({ top: area.scrollHeight }));
      const tagLink = page.getByRole("list", { name: "태그" }).getByRole("link");

      // Act
      await tagLink.focus();

      // Assert
      const headerBottom = await page.locator("main header").locator("visible=true").evaluate((header) => header.getBoundingClientRect().bottom);
      const tagTop = await tagLink.evaluate((link) => link.getBoundingClientRect().top);
      expect(tagTop).toBeGreaterThanOrEqual(headerBottom);
    } finally {
      await deleteRecord();
    }
  });
});
