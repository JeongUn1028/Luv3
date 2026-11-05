import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { E2E_EVENTS, E2E_MEMBER, E2E_TODOS, PHOTO_FIXTURE_PATH, PHOTO_RECORD, TOP_BLANK_SPACE } from "./support/constants";
import { expect, getDocumentOverflow, getScrollArea, getScrollAreaOverflow, openScreen, test } from "./support/test";

const [EVENT] = E2E_EVENTS;
const [TODO] = E2E_TODOS;
const MEMO_MIN_HEIGHT = 122;
// 홈 로고는 머리글보다 4px 커서 위로 그만큼 나온다
const HOME_LOGO_OVERHANG = 4;

/** 화면에 보이는 글자·버튼·이미지 중 가장 위쪽 위치(화면 읽기 전용 글자는 뺀다) */
const getTopmostContentTop = (page: Page): Promise<number> =>
  page.evaluate(() => {
    const isShown = (element: Element): boolean => element.checkVisibility() && !element.closest(".sr-only");
    const tops = [...document.querySelectorAll("svg, img, button, a, input, textarea")].filter(isShown).flatMap((element) => {
      const { top, width, height } = element.getBoundingClientRect();
      return width > 0 && height > 0 ? [top] : [];
    });
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const { parentElement, textContent } = walker.currentNode;
      if (!textContent?.trim() || !parentElement || !isShown(parentElement)) continue;
      // 글자 범위 상자는 글꼴 여백까지 포함해 실제 글자보다 위로 크다. 큰 로고 숫자가 잘못 걸리지 않게 글자를 담은 요소로 잰다
      tops.push(parentElement.getBoundingClientRect().top);
    }
    return Math.min(...tops);
  });

const getSaveButtonBottom = async (page: Page): Promise<number> => {
  const box = await page.getByRole("button", { name: "저장" }).boundingBox();
  expect(box).not.toBeNull();
  return (box?.y ?? 0) + (box?.height ?? 0);
};

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
  { name: "닉네임 변경", path: "/settings/nickname", ready: (page) => page.getByLabel("닉네임", { exact: true }) },
  { name: "비밀번호 변경", path: "/settings/password", ready: (page) => page.getByLabel("현재 비밀번호") },
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

    test(`${name} 화면을 열면 흐림이 생기는 맨 위에 글자와 버튼이 없다`, async ({ page, safeArea }) => {
      await openScreen(page, path, ready(page));

      expect(await getTopmostContentTop(page)).toBeGreaterThanOrEqual(safeArea.top + TOP_BLANK_SPACE - HOME_LOGO_OVERHANG);
    });
  }

  test("머리글은 상태바 아래에 맨 위 빈 자리를 두고 내려온다", async ({ page, safeArea }) => {
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));

    await expect(page.locator("main > .shrink-0")).toHaveCSS("padding-top", `${safeArea.top + TOP_BLANK_SPACE}px`);
  });

  test("탭 화면과 폼 화면의 머리글 위치가 같아 옮겨도 튀지 않는다", async ({ page, safeArea }) => {
    const paths = ["/", "/records", "/calendar", "/todos", "/settings", "/events/new"];
    for (const { path, ready } of SCREENS.filter((screen) => paths.includes(screen.path))) {
      await openScreen(page, path, ready(page));

      expect((await page.locator("main header").locator("visible=true").first().boundingBox())?.y).toBe(safeArea.top + TOP_BLANK_SPACE);
    }
  });

  test("머리글이 내용과 함께 움직이는 기록 상세도 스크롤 영역이 맨 위 빈 자리 아래에서 시작해 내용이 그 자리로 올라가지 않는다", async ({ page, safeArea }) => {
    await openScreen(page, `/dates/${PHOTO_RECORD.id}`, page.getByRole("heading", { name: PHOTO_RECORD.title }));

    expect((await getScrollArea(page).boundingBox())?.y).toBe(safeArea.top + TOP_BLANK_SPACE);
  });

  test.describe("상태바 아래까지 그리지 않을 때(Safari 탭, 컴퓨터)", () => {
    test.use({ safeArea: { top: 0, bottom: 0 } });

    test("맨 위를 비우지 않는다", async ({ page }) => {
      await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));

      await expect(page.locator("main > .shrink-0")).toHaveCSS("padding-top", "0px");
    });
  });

  test.describe("로그아웃 상태", () => {
    test.use({ storageState: { cookies: [], origins: [] } });

    test("로그인 화면을 열면 흐림이 생기는 맨 위에 글자와 버튼이 없다", async ({ page, safeArea }) => {
      await openScreen(page, "/login", page.getByRole("button", { name: "로그인" }));

      expect(await getTopmostContentTop(page)).toBeGreaterThanOrEqual(safeArea.top + TOP_BLANK_SPACE);
    });

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
    expect(await getSaveButtonBottom(page)).toBeLessThanOrEqual((viewport?.height ?? 0) - safeArea.bottom);
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

test.describe("홈 맨 위", () => {
  test("로고가 설정 버튼과 같은 줄 가운데에 있고 제목은 화면 읽기 프로그램이 그대로 읽는다", async ({ page, viewport }) => {
    await openScreen(page, "/", page.getByText(TODO.content));

    const logo = await page.locator("header").getByText("DAYS").boundingBox();
    const settings = await page.getByRole("link", { name: "설정" }).boundingBox();
    expect(logo).not.toBeNull();
    expect(settings).not.toBeNull();
    const logoMiddle = (logo?.y ?? 0) + (logo?.height ?? 0) / 2;
    expect(logoMiddle).toBeGreaterThanOrEqual(settings?.y ?? 0);
    expect(logoMiddle).toBeLessThanOrEqual((settings?.y ?? 0) + (settings?.height ?? 0));
    expect(settings?.width).toBeGreaterThanOrEqual(44);
    expect(settings?.height).toBeGreaterThanOrEqual(44);

    // 하트·숫자·DAYS 묶음이 화면 가운데에 있고 설정 버튼과 겹치지 않는다
    const group = await page.locator("header [aria-hidden='true']", { hasText: "DAYS" }).boundingBox();
    const groupCenter = (group?.x ?? 0) + (group?.width ?? 0) / 2;
    expect(Math.abs(groupCenter - (viewport?.width ?? 0) / 2)).toBeLessThanOrEqual(1);
    expect((group?.x ?? 0) + (group?.width ?? 0)).toBeLessThanOrEqual(settings?.x ?? 0);

    // 탭을 옮겨도 설정·추가 버튼이 위아래로 튀지 않게 머리글 높이가 같다
    const homeHeader = await page.locator("header").boundingBox();
    expect(homeHeader?.height).toBe(44);

    await expect(page.getByRole("heading", { name: "홈", level: 1 })).toBeAttached();
    await expect(page.getByRole("heading", { name: /함께한 지 \d+일째/, level: 2 })).toBeAttached();
    // 화면 읽기 순서: 제목 → 설정 → 함께한 날
    const readOrder = await page.locator("header").locator("h1, a, h2").allInnerTexts();
    expect(readOrder[0]).toBe("홈");
    expect(readOrder[readOrder.length - 1]).toMatch(/함께한 지/);
  });

  test("하트 아래 끝이 DAYS 글자 아랫선에 맞고 숫자가 바뀌어도 그대로다", async ({ page }) => {
    await openScreen(page, "/", page.getByText(TODO.content));
    const logo = page.locator("header [aria-hidden='true']", { hasText: "DAYS" });

    // 하트는 선 두께의 절반만큼 도형 밖으로 그려지고, 글자 아랫선은 높이 없는 칸을 넣어 잰다
    const measure = (): Promise<{ heartBottom: number; baseline: number }> =>
      logo.evaluate((element) => {
        const path = element.querySelector("path");
        const toScreen = path?.getScreenCTM();
        const days = element.querySelector("p:last-child");
        if (!path || !toScreen || !days) throw new Error("로고 요소를 찾지 못했다");
        const { y, height } = path.getBBox();
        const heartBottom = (y + height + Number(path.getAttribute("stroke-width")) / 2) * toScreen.d + toScreen.f;
        const probe = document.createElement("span");
        probe.style.cssText = "display:inline-block;width:0;height:0";
        days.append(probe);
        const baseline = probe.getBoundingClientRect().bottom;
        probe.remove();
        return { heartBottom, baseline };
      });

    const before = await measure();
    expect(Math.abs(before.heartBottom - before.baseline)).toBeLessThanOrEqual(0.5);

    // 숫자마다 높이가 다른 글꼴이라, 다른 숫자로 바꿔도 하트가 위아래로 움직이지 않는지 본다
    await logo.locator("p").first().evaluate((number) => {
      number.textContent = "1208";
    });
    expect((await measure()).heartBottom).toBeCloseTo(before.heartBottom, 1);
  });
});

test.describe("홈 커플 사진", () => {
  // 칸마다 따로 불러오므로 내용이 빠진 채로 재지 않도록 모든 칸을 먼저 기다린다
  const openLoadedHome = async (page: Page): Promise<void> => {
    await openScreen(page, "/", page.getByText(TODO.content));
    await expect(page.getByText(PHOTO_RECORD.title)).toBeVisible();
    for (const { title } of E2E_EVENTS) await expect(page.getByText(title)).toBeVisible();
    await expect(page.getByRole("img", { name: "커플 사진" })).toBeVisible();
  };

  test("남는 높이를 채워 하단 탭 위에 빈 공간이 없고 스크롤도 생기지 않는다", async ({ page, viewport }) => {
    await openLoadedHome(page);

    const area = await getScrollArea(page).boundingBox();
    const last = await getScrollArea(page).locator("> *").last().boundingBox();
    const photo = await page.getByRole("img", { name: "커플 사진" }).boundingBox();
    expect(area).not.toBeNull();
    expect(last).not.toBeNull();
    expect(photo).not.toBeNull();

    // 내용 영역의 아래 안쪽 여백(10px)만 남는다
    expect((area?.y ?? 0) + (area?.height ?? 0) - (last?.y ?? 0) - (last?.height ?? 0)).toBeLessThanOrEqual(11);
    // 세로만 늘고 폭은 좌우 여백(16px씩)을 뺀 그대로다
    expect(photo?.width).toBe((viewport?.width ?? 0) - 32);
    expect((photo?.height ?? 0) * 4).toBeGreaterThan((photo?.width ?? 0) * 3);
    expect(await getScrollAreaOverflow(page)).toEqual({ vertical: 0, horizontal: 0 });
    // 사진을 바꾸는 버튼이 사진 안에 있어 누를 수 있다
    await expect(page.getByRole("button", { name: "커플 사진 바꾸기" })).toBeInViewport({ ratio: 1 });
  });

  test("화면이 낮으면 사진은 4:3 아래로 줄어들지 않고 화면이 스크롤된다", async ({ page, viewport }) => {
    await page.setViewportSize({ width: viewport?.width ?? 0, height: 600 });
    await openLoadedHome(page);

    const photo = await page.getByRole("img", { name: "커플 사진" }).boundingBox();
    expect(photo).not.toBeNull();

    expect(Math.abs((photo?.height ?? 0) - ((photo?.width ?? 0) * 3) / 4)).toBeLessThanOrEqual(1);
    expect((await getScrollAreaOverflow(page)).vertical).toBeGreaterThan(0);
  });
});

test.describe("일정 폼", () => {
  for (const { name, path } of [
    { name: "일정 추가", path: "/events/new" },
    { name: "일정 고치기", path: `/events/${EVENT.id}/edit` },
  ]) {
    test(`${name} 화면을 열면 넘치지 않고 저장 버튼이 화면 아래에 붙으며 메모 칸이 4줄 높이를 유지한다`, async ({ page, safeArea, viewport }) => {
      await openScreen(page, path, page.locator("#event-memo"));

      expect((await getScrollAreaOverflow(page)).vertical).toBe(0);
      expect(await getSaveButtonBottom(page)).toBeCloseTo((viewport?.height ?? 0) - safeArea.bottom, 0);
      const memo = await page.locator("#event-memo").boundingBox();
      expect(memo?.height).toBeGreaterThanOrEqual(MEMO_MIN_HEIGHT);
    });
  }

  test("일정 추가에서 종일을 끄고 끝까지 내리면 안쪽만 스크롤되고 저장 버튼이 safe-area 위에 멈춘다", async ({ page, safeArea, viewport }) => {
    // Arrange
    await openScreen(page, "/events/new", page.locator("#event-memo"));
    const header = page.locator("main > .shrink-0");
    const headerTop = (await header.boundingBox())?.y;
    expect(headerTop).toBeDefined();

    // Act
    await page.getByRole("checkbox", { name: "종일" }).uncheck();
    expect((await getScrollAreaOverflow(page)).vertical).toBeGreaterThan(0);
    await getScrollArea(page).evaluate((element) => element.scrollTo(0, element.scrollHeight));

    // Assert
    expect(await getDocumentOverflow(page)).toBe(0);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect((await header.boundingBox())?.y).toBe(headerTop);
    expect(await getSaveButtonBottom(page)).toBeLessThanOrEqual((viewport?.height ?? 0) - safeArea.bottom);
    const memo = await page.locator("#event-memo").boundingBox();
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
