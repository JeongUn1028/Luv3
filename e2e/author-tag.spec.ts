import { randomUUID } from "node:crypto";
import type { Locator } from "@playwright/test";
import { E2E_EVENTS, E2E_MEMBER, E2E_TODOS, PHOTO_RECORD } from "./support/constants";
import { createDisposableAuthorTodo, createDisposableEvent, createDisposableTodo } from "./support/seed";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";

const AUTHOR_NAME = `작성자 ${E2E_MEMBER.nickname}`;
/** DB가 받는 가장 긴 예전 닉네임(20자) */
const LONGEST_NICKNAME = "가나다라마바사아자차카타파하가나다라마바";
/** 닉네임 변경(#133)에서 허용할 가장 긴 닉네임. 넓은 글자로 재도 줄지 않아야 한다 */
const SIX_CHARACTER_NICKNAME = "뷁뷁뷁뷁뷁뷁";

const getTodoRow = (locator: Locator, content: string): Locator => locator.getByRole("listitem").filter({ hasText: content });

/** 이름표가 줄었는지 재려고 글자 칸의 넘침을 잰다 */
const isTruncated = (tag: Locator): Promise<boolean> => tag.evaluate((element) => element.scrollWidth > element.clientWidth);

const getRightEdge = (tag: Locator): Promise<number> => tag.evaluate((element) => element.getBoundingClientRect().right);

test.describe("작성자 이름표", () => {
  test("Todo 목록은 화면 읽기 프로그램이 작성자 이름을 읽는다", async ({ page }) => {
    // Act
    await openScreen(page, "/todos", page.getByText(E2E_TODOS[0].content));

    // Assert
    expect(await getTodoRow(page.locator("main"), E2E_TODOS[0].content).ariaSnapshot()).toContain(AUTHOR_NAME);
  });

  test("캘린더 아래 목록은 일정 링크 이름에 작성자 이름이 들어간다", async ({ page }) => {
    // Act
    await openScreen(page, "/calendar", page.getByText(E2E_EVENTS[0].title));

    // Assert
    await expect(page.getByRole("link", { name: new RegExp(`${E2E_EVENTS[0].title}.*${AUTHOR_NAME}`) })).toBeVisible();
  });

  test("캘린더 아래 목록의 한 사람 일정 줄은 이름을 주인 이름표에 한 번만 보여 준다", async ({ page }, testInfo) => {
    // Arrange
    const title = `한 사람 일정 줄 ${testInfo.project.name}`;
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

  test("하고 싶은 것 폼은 머리글에서 작성자 이름을 읽는다", async ({ page }) => {
    // Arrange
    const id = randomUUID();
    const deleteTodo = await createDisposableTodo({ id, content: "E2E 이름표 항목" });

    try {
      // Act
      await openScreen(page, `/todos/${id}/edit`, page.getByRole("heading", { name: "하고 싶은 것 고치기" }));

      // Assert
      expect(await page.locator("header").ariaSnapshot()).toContain(AUTHOR_NAME);
    } finally {
      await deleteTodo();
    }
  });

  test("가장 긴 닉네임은 줄여 그려도 전체를 읽고, 줄이 넘치지 않으며 오른쪽 끝이 다른 줄과 맞는다", async ({ page }, testInfo) => {
    // Arrange
    // 두 기기가 같은 DB를 나란히 쓰므로 내용을 기기마다 다르게 한다
    const content = `E2E 긴 이름표 항목 ${testInfo.project.name}`;
    const deleteAuthorTodo = await createDisposableAuthorTodo({ nickname: LONGEST_NICKNAME, content });

    try {
      // Act
      await openScreen(page, "/todos", page.getByText(content));
      const row = getTodoRow(page.locator("main"), content);
      const longTag = row.getByTitle(LONGEST_NICKNAME);
      const shortTag = getTodoRow(page.locator("main"), E2E_TODOS[0].content).getByTitle(E2E_MEMBER.nickname);

      // Assert
      expect(await row.ariaSnapshot()).toContain(`작성자 ${LONGEST_NICKNAME}`);
      expect(await isTruncated(longTag)).toBe(true);
      expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);
      expect(await getRightEdge(longTag)).toBe(await getRightEdge(shortTag));
    } finally {
      await deleteAuthorTodo();
    }
  });

  test("넓은 글자 6자 닉네임은 줄지 않고 전체가 보인다", async ({ page }, testInfo) => {
    // Arrange
    const content = `E2E 6자 이름표 항목 ${testInfo.project.name}`;
    const deleteAuthorTodo = await createDisposableAuthorTodo({ nickname: SIX_CHARACTER_NICKNAME, content });

    try {
      // Act
      await openScreen(page, "/todos", page.getByText(content));

      // Assert
      expect(await isTruncated(getTodoRow(page.locator("main"), content).getByTitle(SIX_CHARACTER_NICKNAME))).toBe(false);
    } finally {
      await deleteAuthorTodo();
    }
  });
});
