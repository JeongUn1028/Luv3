import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { E2E_EVENTS, E2E_MEMBER, E2E_TODOS, PHOTO_FIXTURE_PATH, PHOTO_RECORD } from "./support/constants";
import { expect, getDocumentOverflow, getScrollArea, getScrollAreaOverflow, openScreen, test } from "./support/test";

const [EVENT] = E2E_EVENTS;
const [TODO] = E2E_TODOS;
const MEMO_MIN_HEIGHT = 122;

interface Screen {
  name: string;
  path: string;
  /** 로딩 뼈대가 아니라 실제 내용이 그려졌음을 알려 주는 요소 */
  ready: (page: Page) => Locator;
}

const SCREENS: Screen[] = [
  { name: "홈", path: "/", ready: (page) => page.getByText(TODO.content) },
  { name: "기록", path: "/records", ready: (page) => page.locator(`a[href="/dates/${PHOTO_RECORD.id}"]`) },
  { name: "캘린더", path: "/calendar", ready: (page) => page.locator('button[aria-pressed="true"]') },
  { name: "Todo", path: "/todos", ready: (page) => page.getByText(TODO.content) },
  { name: "설정", path: "/settings", ready: (page) => page.getByText(E2E_MEMBER.nickname, { exact: true }) },
  { name: "기록 상세", path: `/dates/${PHOTO_RECORD.id}`, ready: (page) => page.getByRole("heading", { name: PHOTO_RECORD.title }) },
  { name: "기록 작성", path: "/dates/new", ready: (page) => page.locator("#memo") },
  { name: "기록 고치기", path: `/dates/${PHOTO_RECORD.id}/edit`, ready: (page) => page.locator("#memo") },
  { name: "일정 추가", path: "/events/new", ready: (page) => page.locator("#event-memo") },
  { name: "일정 고치기", path: `/events/${EVENT.id}/edit`, ready: (page) => page.locator("#event-memo") },
  { name: "하고 싶은 것 추가", path: "/todos/new", ready: (page) => page.getByRole("textbox") },
  { name: "하고 싶은 것 고치기", path: `/todos/${TODO.id}/edit`, ready: (page) => page.getByRole("textbox") },
  { name: "찾을 수 없음", path: "/e2e-missing", ready: (page) => page.getByRole("heading", { name: "화면을 찾을 수 없어요" }) },
];

test.describe("화면 높이", () => {
  for (const { name, path, ready } of SCREENS) {
    test(`${name} 화면을 열면 문서가 화면 높이를 넘지 않는다`, async ({ page }) => {
      await openScreen(page, path, ready(page));

      expect(await getDocumentOverflow(page)).toBe(0);
    });
  }

  test("safe-area를 넣으면 머리글이 위 여백만큼 내려온다", async ({ page, safeArea }) => {
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));

    await expect(page.locator("main > .shrink-0")).toHaveCSS("padding-top", `${safeArea.top}px`);
  });

  test.describe("로그아웃 상태", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("로그인 화면을 열면 문서가 화면 높이를 넘지 않는다", async ({ page }) => {
      await openScreen(page, "/login", page.getByRole("button", { name: "로그인" }));

      expect(await getDocumentOverflow(page)).toBe(0);
    });
  });
});

test.describe("내용 스크롤 영역", () => {
  test("내용이 다 있는 홈을 열면 스크롤 영역이 넘치지 않는다", async ({ page }) => {
    await openScreen(page, "/", page.getByText(TODO.content));

    // 내용이 빠진 채로 재지 않도록 커플 사진·기록·일정 2개·하고 싶은 것 3개가 있는지 먼저 본다
    await expect(page.getByText(PHOTO_RECORD.title)).toBeVisible();
    for (const { title } of E2E_EVENTS) await expect(page.getByText(title)).toBeVisible();
    for (const { content } of E2E_TODOS) await expect(page.getByText(content)).toBeVisible();
    const loadedImages = await page.evaluate(() => [...document.images].filter((image) => image.naturalWidth > 0).length);
    expect(loadedImages).toBeGreaterThanOrEqual(2);
    expect((await getScrollAreaOverflow(page)).vertical).toBe(0);
  });

  test("빈 기록 작성 화면을 열면 스크롤 영역이 넘치지 않는다", async ({ page }) => {
    await openScreen(page, "/dates/new", page.locator("#memo"));

    expect((await getScrollAreaOverflow(page)).vertical).toBe(0);
  });

  test("사진 있는 기록 고치기를 끝까지 내리면 안쪽만 스크롤되고 저장 버튼이 safe-area 위에 멈춘다", async ({ page, safeArea, viewport }) => {
    // Arrange
    await openScreen(page, `/dates/${PHOTO_RECORD.id}/edit`, page.locator("#memo"));
    const header = page.locator("main > .shrink-0");
    const headerTop = (await header.boundingBox())?.y;
    expect(headerTop).toBeDefined();
    expect((await getScrollAreaOverflow(page)).vertical).toBeGreaterThan(0);

    // Act
    await getScrollArea(page).evaluate((element) => element.scrollTo(0, element.scrollHeight));

    // Assert
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await header.boundingBox())?.y).toBe(headerTop);
    const saveButton = await page.getByRole("button", { name: "저장" }).boundingBox();
    expect(saveButton).not.toBeNull();
    expect((saveButton?.y ?? 0) + (saveButton?.height ?? 0)).toBeLessThanOrEqual((viewport?.height ?? 0) - safeArea.bottom);
  });

  test("기록 작성에서 사진을 고르면 정리 글 칸이 4줄 높이를 유지한다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/dates/new", page.locator("#memo"));

    // Act
    await page.getByLabel("사진 고르기").setInputFiles({
      name: "photo.jpg",
      mimeType: "image/jpeg",
      buffer: readFileSync(PHOTO_FIXTURE_PATH),
    });
    await page.getByRole("button", { name: "1번째 사진 빼기" }).waitFor();

    // Assert
    const memo = await page.locator("#memo").boundingBox();
    expect(memo?.height).toBeGreaterThanOrEqual(MEMO_MIN_HEIGHT);
  });
});

test.describe("날짜·시간 칸", () => {
  const expectSameWidth = async (page: Page, ids: string[]): Promise<void> => {
    const widths = await Promise.all(ids.map(async (id) => (await page.locator(id).boundingBox())?.width));

    expect(widths.every((width) => width !== undefined)).toBe(true);
    expect(new Set(widths).size).toBe(1);
    expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);
  };

  test("기록 작성에서 기간을 켜면 날짜 칸이 다른 칸과 같은 폭이고 가로로 넘치지 않는다", async ({ page }) => {
    await openScreen(page, "/dates/new", page.locator("#memo"));

    await page.getByRole("checkbox", { name: "기간으로 남기기" }).check();

    await expectSameWidth(page, ["#date", "#endDate", "#title"]);
  });

  test("일정 추가에서 종일을 끄면 날짜·시간 칸이 다른 칸과 같은 폭이고 가로로 넘치지 않는다", async ({ page }) => {
    await openScreen(page, "/events/new", page.locator("#event-memo"));

    await page.getByRole("checkbox", { name: "종일" }).uncheck();

    await expectSameWidth(page, ["#event-date", "#event-time", "#event-title"]);
  });
});
