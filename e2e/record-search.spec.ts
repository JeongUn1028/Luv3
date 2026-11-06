import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { createDisposableRecord, setRecordSearchFields, setRecordTags } from "./support/seed";
import { expect, getScrollArea, getScrollAreaOverflow, openScreen, test } from "./support/test";

/** 나란히 도는 테스트의 기록과 섞이지 않는 낱말. 태그 10자 제한 안에 들어온다 */
const createWord = (): string => `찾기${randomUUID().slice(0, 6)}`;

const getRecordLink = (page: Page, title: string) => page.getByRole("link", { name: new RegExp(title) });

const openSearch = async (page: Page): Promise<void> => {
  await openScreen(page, "/records", page.getByRole("button", { name: "기록 찾기" }));
  await page.getByRole("button", { name: "기록 찾기" }).click();
  await page.getByRole("searchbox", { name: "기록 찾기" }).waitFor();
};

test.describe("기록 찾기", () => {
  test("평소에는 검색 칸이 없고, 돋보기로 열고 닫으면 적은 글자도 지워진다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/records", page.getByRole("button", { name: "기록 찾기" }));
    const searchBox = page.getByRole("searchbox", { name: "기록 찾기" });
    await expect(searchBox).toHaveCount(0);

    // Act
    await page.getByRole("button", { name: "기록 찾기" }).click();
    await searchBox.fill("적던 글자");
    await page.getByRole("button", { name: "찾기 닫기" }).click();

    // Assert
    await expect(searchBox).toHaveCount(0);
    await page.getByRole("button", { name: "기록 찾기" }).click();
    await expect(searchBox).toHaveValue("");
  });

  test("제목·장소·정리 글·사진 한마디로 찾는다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const [titleWord, placeWord, memoWord, captionWord] = [createWord(), createWord(), createWord(), createWord()];
    const title = `E2E 찾기 ${titleWord}`;
    const deleteRecord = await createDisposableRecord({ id, title });
    await setRecordSearchFields(id, { place: placeWord, memo: memoWord, caption: captionWord });

    try {
      await openSearch(page);
      const searchBox = page.getByRole("searchbox", { name: "기록 찾기" });

      for (const word of [titleWord, placeWord, memoWord, captionWord]) {
        // Act
        await searchBox.fill(word);

        // Assert
        await expect(getRecordLink(page, title)).toBeVisible();
        await expect(page.getByRole("status").filter({ hasText: "기록 1개" })).toBeVisible();
      }
    } finally {
      await deleteRecord();
    }
  });

  test("맞는 기록이 없으면 알려 주고, 글자를 지우면 다시 보인다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const title = `E2E 찾기 없음 ${createWord()}`;
    const deleteRecord = await createDisposableRecord({ id, title });

    try {
      await openSearch(page);
      const searchBox = page.getByRole("searchbox", { name: "기록 찾기" });

      // Act
      await searchBox.fill(createWord());

      // Assert
      await expect(page.getByRole("status").filter({ hasText: "찾는 기록이 없어요" })).toBeVisible();
      await expect(getRecordLink(page, title)).toHaveCount(0);

      // Act
      await searchBox.fill("");

      // Assert
      await expect(getRecordLink(page, title)).toBeVisible();
    } finally {
      await deleteRecord();
    }
  });

  test("태그를 누르면 그 태그의 기록만 모으고, 전체를 누르면 되돌린다", async ({ page }) => {
    // Arrange
    const [taggedId, otherId] = [randomUUID(), randomUUID()];
    const tag = createWord();
    const taggedTitle = `E2E 태그 있음 ${createWord()}`;
    const otherTitle = `E2E 태그 없음 ${createWord()}`;
    const deleteTagged = await createDisposableRecord({ id: taggedId, title: taggedTitle });
    const deleteOther = await createDisposableRecord({ id: otherId, title: otherTitle });
    await setRecordTags(taggedId, [tag]);

    try {
      await openSearch(page);
      const tagButton = page.getByRole("button", { name: tag, exact: true });

      // Act
      await tagButton.click();

      // Assert
      await expect(tagButton).toHaveAttribute("aria-pressed", "true");
      await expect(getRecordLink(page, taggedTitle)).toBeVisible();
      await expect(getRecordLink(page, otherTitle)).toHaveCount(0);
      expect(new URL(page.url()).searchParams.get("tag")).toBe(tag);

      // Act
      await page.getByRole("button", { name: "전체", exact: true }).click();

      // Assert
      await expect(getRecordLink(page, otherTitle)).toBeVisible();
      expect(new URL(page.url()).searchParams.get("tag")).toBeNull();
    } finally {
      await deleteTagged();
      await deleteOther();
    }
  });

  test("찾은 기록에 들어갔다 돌아오면 검색어와 태그가 그대로다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const tag = createWord();
    const titleWord = createWord();
    const title = `E2E 다녀오기 ${titleWord}`;
    const deleteRecord = await createDisposableRecord({ id, title });
    await setRecordTags(id, [tag]);

    try {
      await openSearch(page);
      await page.getByRole("button", { name: tag, exact: true }).click();
      await page.getByRole("searchbox", { name: "기록 찾기" }).fill(titleWord);

      // Act
      await getRecordLink(page, title).click();
      await page.waitForURL(new RegExp(`/dates/${id}$`));
      const refreshes: string[] = [];
      page.on("request", (request) => {
        if (new URL(request.url()).pathname === "/records" && request.headers().rsc) refreshes.push(request.url());
      });
      await page.getByRole("link", { name: "뒤로" }).click();
      await page.waitForURL(/\/records/);

      // Assert
      await expect(page.getByRole("searchbox", { name: "기록 찾기" })).toHaveValue(titleWord);
      await expect(page.getByRole("button", { name: tag, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByRole("status").filter({ hasText: "기록 1개" })).toBeVisible();
      // 받은 지 30초가 안 됐으니 다시 부르지 않는다. HistoryReturn이 판단하는 때(300ms)가 지나기를 기다린다
      await page.waitForTimeout(700);
      expect(refreshes).toEqual([]);
    } finally {
      await deleteRecord();
    }
  });

  test("상세의 태그를 누르면 기록 탭에서 그 태그의 기록을 모아 보여 준다", async ({ page }) => {
    // Arrange
    const [taggedId, otherId] = [randomUUID(), randomUUID()];
    const tag = createWord();
    const taggedTitle = `E2E 상세 태그 ${createWord()}`;
    const otherTitle = `E2E 상세 태그 아님 ${createWord()}`;
    const deleteTagged = await createDisposableRecord({ id: taggedId, title: taggedTitle });
    const deleteOther = await createDisposableRecord({ id: otherId, title: otherTitle });
    await setRecordTags(taggedId, [tag]);

    try {
      await openScreen(page, `/dates/${taggedId}`, page.getByRole("list", { name: "태그" }));

      // Act
      await page.getByRole("link", { name: tag }).click();
      await page.waitForURL(/\/records\?/);

      // Assert
      await expect(page.getByRole("button", { name: tag, exact: true })).toHaveAttribute("aria-pressed", "true");
      await expect(getRecordLink(page, taggedTitle)).toBeVisible();
      await expect(getRecordLink(page, otherTitle)).toHaveCount(0);
      await expect(page.getByRole("button", { name: "찾기 닫기" })).toBeVisible();
    } finally {
      await deleteTagged();
      await deleteOther();
    }
  });

  test("찾던 중에 들어간 상세의 태그를 누르면 검색어 없이 그 태그의 기록을 모두 보여 준다", async ({ page }) => {
    // Arrange
    const [firstId, secondId] = [randomUUID(), randomUUID()];
    const tag = createWord();
    const titleWord = createWord();
    const firstTitle = `E2E 찾던 기록 ${titleWord}`;
    const secondTitle = `E2E 같은 태그 ${createWord()}`;
    const deleteFirst = await createDisposableRecord({ id: firstId, title: firstTitle });
    const deleteSecond = await createDisposableRecord({ id: secondId, title: secondTitle });
    await setRecordTags(firstId, [tag]);
    await setRecordTags(secondId, [tag]);

    try {
      await openSearch(page);
      await page.getByRole("searchbox", { name: "기록 찾기" }).fill(titleWord);
      await getRecordLink(page, firstTitle).click();
      await page.waitForURL(new RegExp(`/dates/${firstId}$`));

      // Act
      await page.getByRole("link", { name: tag }).click();
      await page.waitForURL(/\/records\?/);

      // Assert
      await expect(page.getByRole("searchbox", { name: "기록 찾기" })).toHaveValue("");
      await expect(getRecordLink(page, firstTitle)).toBeVisible();
      await expect(getRecordLink(page, secondTitle)).toBeVisible();
    } finally {
      await deleteFirst();
      await deleteSecond();
    }
  });

  test("아래로 내려 본 기록의 상세에서 태그를 누르면 맨 위부터 보여 준다", async ({ page }) => {
    // Arrange: 기록이 몇 개뿐이어도 스크롤이 생기게 화면을 줄인다
    await page.setViewportSize({ width: 393, height: 420 });
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const tag = createWord();
    const deletes = await Promise.all(ids.map((id) => createDisposableRecord({ id, title: `E2E 맨 위 ${id}` })));
    await Promise.all(ids.map((id) => setRecordTags(id, [tag])));

    try {
      await openScreen(page, "/records", page.getByRole("button", { name: "기록 찾기" }));
      const scrollArea = getScrollArea(page);
      await scrollArea.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
      const link = getRecordLink(page, `E2E 맨 위 ${ids[0]}`);
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await page.waitForURL(new RegExp(`/dates/${ids[0]}$`));

      // Act
      await page.getByRole("link", { name: tag }).click();
      await page.waitForURL(/\/records\?/);

      // Assert
      await expect(page.getByRole("searchbox", { name: "기록 찾기" })).toBeInViewport({ ratio: 1 });
    } finally {
      await Promise.all(deletes.map((deleteRecord) => deleteRecord()));
    }
  });

  test("상세의 태그가 태그 줄 끝에 있어도 고른 태그가 보이도록 줄을 민다", async ({ page }) => {
    // Arrange: 가나다순으로 맨 뒤에 놓일 태그와, 줄을 길게 만들 태그들
    const [id, otherId] = [randomUUID(), randomUUID()];
    const tag = `힣${randomUUID().slice(0, 6)}`;
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 줄 끝 태그" });
    const deleteOther = await createDisposableRecord({ id: otherId, title: "E2E 줄 끝 태그 둘" });
    await setRecordTags(id, [tag]);
    await setRecordTags(otherId, Array.from({ length: 5 }, () => `가나다${randomUUID().slice(0, 7)}`));

    try {
      await openScreen(page, `/dates/${id}`, page.getByRole("list", { name: "태그" }));

      // Act
      await page.getByRole("link", { name: tag }).click();
      await page.waitForURL(/\/records\?/);

      // Assert
      await expect(page.getByRole("button", { name: tag, exact: true })).toBeInViewport({ ratio: 1 });
    } finally {
      await deleteRecord();
      await deleteOther();
    }
  });

  test("검색 키를 누르면 키보드를 닫으려고 칸에서 초점을 뺀다", async ({ page }) => {
    // Arrange
    await openSearch(page);
    const searchBox = page.getByRole("searchbox", { name: "기록 찾기" });
    await searchBox.fill(createWord());

    // Act
    await searchBox.press("Enter");

    // Assert
    await expect(searchBox).not.toBeFocused();
  });

  test("걸러 둔 채 기록 탭을 다시 누르면 찾기를 닫고 모든 기록을 보여 준다", async ({ page }) => {
    // Arrange
    const [taggedId, otherId] = [randomUUID(), randomUUID()];
    const tag = createWord();
    const otherTitle = `E2E 탭 다시 ${createWord()}`;
    const deleteTagged = await createDisposableRecord({ id: taggedId, title: `E2E 탭 태그 ${createWord()}` });
    const deleteOther = await createDisposableRecord({ id: otherId, title: otherTitle });
    await setRecordTags(taggedId, [tag]);

    try {
      await openSearch(page);
      await page.getByRole("button", { name: tag, exact: true }).click();
      await expect(getRecordLink(page, otherTitle)).toHaveCount(0);

      // Act
      await page.getByRole("navigation", { name: "주요 화면" }).getByRole("link", { name: "기록" }).click();

      // Assert
      await expect(page.getByRole("searchbox", { name: "기록 찾기" })).toHaveCount(0);
      await expect(getRecordLink(page, otherTitle)).toBeVisible();
    } finally {
      await deleteTagged();
      await deleteOther();
    }
  });

  test("아래로 내려 본 뒤 돋보기를 누르면 맨 위로 올라와 검색 칸이 보인다", async ({ page }) => {
    // Arrange: 기록이 몇 개뿐이어도 스크롤이 생기게 화면을 줄인다
    await page.setViewportSize({ width: 393, height: 420 });
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const deletes = await Promise.all(ids.map((id) => createDisposableRecord({ id, title: `E2E 스크롤 ${id}` })));

    try {
      await openScreen(page, "/records", page.getByRole("button", { name: "기록 찾기" }));
      const scrollArea = getScrollArea(page);
      await scrollArea.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));

      // Act
      await page.getByRole("button", { name: "기록 찾기" }).click();

      // Assert
      await expect(page.getByRole("searchbox", { name: "기록 찾기" })).toBeInViewport({ ratio: 1 });
    } finally {
      await Promise.all(deletes.map((deleteRecord) => deleteRecord()));
    }
  });

  test("태그가 많아도 화면이 가로로 넘치지 않고 태그 줄만 옆으로 밀린다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteRecord = await createDisposableRecord({ id, title: "E2E 태그 줄" });
    const otherId = randomUUID();
    const deleteOther = await createDisposableRecord({ id: otherId, title: "E2E 태그 줄 둘" });
    await setRecordTags(id, Array.from({ length: 5 }, () => `가나다${randomUUID().slice(0, 7)}`));
    await setRecordTags(otherId, Array.from({ length: 5 }, () => `라마바${randomUUID().slice(0, 7)}`));

    try {
      // Act
      await openSearch(page);
      const tagRow = page.getByRole("list", { name: "태그로 모아 보기" });
      await tagRow.waitFor();

      // Assert
      expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);
      const { scrollWidth, clientWidth } = await tagRow.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
      expect(scrollWidth).toBeGreaterThan(clientWidth);
    } finally {
      await deleteRecord();
      await deleteOther();
    }
  });
});
