import { randomUUID } from "node:crypto";
import type { Locator } from "@playwright/test";
import { E2E_EVENTS, E2E_MEMBER, E2E_TODOS, PHOTO_RECORD } from "./support/constants";
import { createDisposableEvent, createDisposableMember, createDisposableTodo, createMemberContent } from "./support/seed";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

const AUTHOR_NAME = `작성자 ${E2E_MEMBER.nickname}`;
/** DB가 받는 가장 긴 예전 닉네임(20자). 넓은 글자 6자가 줄지 않는지는 닉네임 변경 E2E가 본다 */
const LONGEST_NICKNAME = "가나다라마바사아자차카타파하가나다라마바";

const getTodoRow = (locator: Locator, content: string): Locator => locator.getByRole("listitem").filter({ hasText: content });

/** 이름표가 줄었는지 재려고 글자 칸의 넘침을 잰다 */
const isTruncated = (tag: Locator): Promise<boolean> => tag.evaluate((element) => element.scrollWidth > element.clientWidth);

test.describe("작성자 이름표", () => {
  // 둘이 함께 쓰는 목록이라 누가 적었는지는 보여 주지 않는다(#204)
  test("Todo 목록은 작성자 이름표를 보여 주지도 읽지도 않는다", async ({ page }) => {
    // Act
    await openScreen(page, "/todos", page.getByText(E2E_TODOS[0].content));
    const row = getTodoRow(page.locator("main"), E2E_TODOS[0].content);

    // Assert: 다른 사람이 쓴 항목이나 다른 종류의 이름표가 돌아와도 잡도록 이름표 전체를 센다
    await expect(row.getByRole("img")).toHaveCount(0);
    expect(await row.ariaSnapshot()).not.toContain("작성자");
  });

  test("캘린더 아래 목록의 함께 일정 줄은 작성자 대신 함께 이름표를 보여 주고 함께 일정으로 읽는다", async ({ page }) => {
    // Act
    await openScreen(page, "/calendar", page.getByText(E2E_EVENTS[0].title));
    // 오늘의 함께 일정이라 같은 제목이 든 "기록 남기기" 링크도 있어 일정 주소로 고른다
    const row = page.locator(`a[href^="/events/${E2E_EVENTS[0].id}/"]`);

    // Assert: 홈 일정 칸과 같은 이름을 쓴다(#201)
    await expect(row.getByRole("img", { name: "함께 일정" })).toHaveText("함께");
    await expect(row.getByText(E2E_MEMBER.nickname, { exact: true })).toHaveCount(0);
    expect(await row.ariaSnapshot()).not.toContain(AUTHOR_NAME);
  });

  test("캘린더 아래 목록의 한 사람 일정 줄은 이름을 주인 이름표에 한 번만 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const title = createTestName("한 사람 일정 줄", testInfo);
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title, isTogether: false });

    try {
      // Act
      await openScreen(page, "/calendar", page.getByText(title));
      const row = page.getByRole("link", { name: new RegExp(title) });

      // Assert
      await expect(row.getByText(E2E_MEMBER.nickname, { exact: true })).toHaveCount(1);
      await expect(row.getByRole("img", { name: `${E2E_MEMBER.nickname} 일정` })).toBeVisible();
    } finally {
      await deleteEvent();
    }
  });

  test("기록 상세는 화면 읽기 프로그램이 작성자 이름을 읽는다", async ({ page }) => {
    // Act
    await openScreen(page, `/dates/${PHOTO_RECORD.id}`, page.getByRole("heading", { name: PHOTO_RECORD.title }));

    // Assert
    expect(await page.locator("article").ariaSnapshot()).toContain(AUTHOR_NAME);
  });

  test("일정 폼은 머리글에서 작성자 이름을 읽는다", async ({ page }) => {
    // Arrange: 폼은 고치기 화면에서만 작성자를 보여 준다
    const id = randomUUID();
    const deleteEvent = await createDisposableEvent({ id, title: "E2E 이름표 일정" });

    try {
      // Act
      await openScreen(page, `/events/${id}/edit`, page.getByRole("heading", { name: "일정 고치기" }));

      // Assert
      expect(await page.locator("header").ariaSnapshot()).toContain(AUTHOR_NAME);
    } finally {
      await deleteEvent();
    }
  });

  test("하고 싶은 것 고치기 화면은 머리글에 작성자 이름표가 없다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: "E2E 이름표 항목" });

    try {
      // Act
      await openScreen(page, `/todos/${id}/edit`, page.getByRole("heading", { name: "하고 싶은 것 고치기" }));

      // Assert
      await expect(page.locator("header").getByTitle(E2E_MEMBER.nickname)).toHaveCount(0);
      expect(await page.locator("header").ariaSnapshot()).not.toContain("작성자");
    } finally {
      await deleteTodo();
    }
  });

  test("가장 긴 닉네임은 작성자·일정 주인 이름표 모두 줄여 그려도 전체를 읽고, 화면이 넘치지 않는다", async ({ page }, testInfo) => {
    // Arrange: 공유 계정의 닉네임을 바꾸면 나란히 도는 테스트가 흔들려 임시 작성자를 만든다
    const label = createTestName("E2E 긴 이름표", testInfo);
    const { id: memberId, remove } = await createDisposableMember(randomUUID(), LONGEST_NICKNAME);

    try {
      const { recordId } = await createMemberContent({ memberId, label });

      // Act & Assert: 기록 상세의 작성자 이름표
      await openScreen(page, `/dates/${recordId}`, page.getByRole("heading", { name: `${label} 기록` }));
      const authorTag = page.locator("article").getByRole("img", { name: `작성자 ${LONGEST_NICKNAME}` });
      await expect(authorTag).toBeVisible();
      expect(await isTruncated(authorTag)).toBe(true);
      expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);

      // 캘린더 한 사람 일정 줄의 주인 이름표
      await openScreen(page, "/calendar", page.getByText(`${label} 일정`));
      const ownerTag = page.getByRole("link", { name: new RegExp(`${label} 일정`) }).getByRole("img", { name: `${LONGEST_NICKNAME} 일정` });
      await expect(ownerTag).toBeVisible();
      expect(await isTruncated(ownerTag)).toBe(true);
      expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);
    } finally {
      await remove();
    }
  });
});
