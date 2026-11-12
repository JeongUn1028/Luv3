import type { Locator, Page } from "@playwright/test";
import { E2E_EVENTS, E2E_MEMBER, E2E_TODOS, PHOTO_RECORD, TOP_BLANK_SPACE } from "./support/constants";
import { pickPhoto } from "./support/actions";
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
  {
    name: "지도",
    path: "/records/map",
    // 나란히 도는 다른 테스트가 좌표를 넣으면 빈 안내 대신 지도가 나온다
    ready: (page) => page.getByText("아직 지도에 표시할 사진이 없어요").or(page.getByRole("list", { name: "지도에 있는 사진" })),
  },
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
  // 지도 화면이 실제 카카오를 부르지 않게 막는다. 지도를 못 불러온 안내로 높이를 잰다
  test.beforeEach(async ({ page }) => {
    await page.route("**/dapi.kakao.com/**", (route) => route.abort());
  });

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

test.describe("하단 탭", () => {
  const TAB_PATHS = ["/", "/records", "/calendar", "/todos"];

  for (const { name, path, ready } of SCREENS.filter((screen) => TAB_PATHS.includes(screen.path))) {
    test(`${name} 탭 화면은 하단 탭을 화면 맨 아래, 스크롤 영역 바로 아래에 두고 지금 탭을 알린다`, async ({ page, safeArea }) => {
      // Act
      await openScreen(page, path, ready(page));

      // Assert: fixed로 띄우면 홈 화면 앱 첫 실행 때 위로 뜨고, 스크롤 영역이 하단 탭 아래까지 이어진다(#51)
      const tabBar = page.getByRole("navigation", { name: "주요 화면" }).locator("visible=true");
      const scrollArea = getScrollArea(page).locator("visible=true");
      const tabBox = await tabBar.boundingBox();
      const scrollBox = await scrollArea.boundingBox();
      expect(tabBox?.y ?? 0).toBeGreaterThan(0);
      expect((tabBox?.y ?? 0) + (tabBox?.height ?? 0)).toBeCloseTo(page.viewportSize()?.height ?? 0, 0);
      expect((scrollBox?.y ?? 0) + (scrollBox?.height ?? 0)).toBeCloseTo(tabBox?.y ?? 0, 0);
      // 아래 safe-area는 하단 탭이 채우므로 내용 아래에 같은 여백을 또 두지 않는다
      expect(await scrollArea.evaluate((element) => Number.parseFloat(getComputedStyle(element).paddingBottom))).toBeLessThan(safeArea.bottom);
      await expect(tabBar.locator('a[aria-current="page"]')).toHaveAttribute("href", path);
    });
  }
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
    await pickPhoto(page, 1);

    // Assert
    const memo = await page.locator("#memo").boundingBox();
    expect(memo?.height).toBeGreaterThanOrEqual(MEMO_MIN_HEIGHT);
  });
});

/** 홈 머리글 가운데의 하트 + 숫자 묶음(화면 읽기 프로그램에는 숨긴 h2 제목만 읽힌다) */
const getDdayGroup = (page: Page): Locator => page.locator("header section > [aria-hidden='true']").locator("visible=true");

interface DdayShape {
  top: number;
  bottom: number;
  middle: number;
  height: number;
}

/**
 * 하트·`+`는 그려진 선(중심선), 숫자는 글자 잉크(canvas로 잰 높이 + 글자 아랫선)의 위아래 범위를 화면 좌표로 잰다.
 * 상자로 재면 글꼴 위아래 여백과 하트 상자 여백 때문에 실제로 보이는 모양과 어긋난다.
 * 이렇게 잰 값도 화면 픽셀과 0.5px쯤 차이가 나서(선 끝 모양, 글자 다듬기) 가운데는 1px까지 같다고 본다
 */
const DDAY_MIDDLE_TOLERANCE = 1;
const measureDdayShapes = (group: Locator): Promise<{ heart: DdayShape; plus: DdayShape; digits: DdayShape }> =>
  group.evaluate((element) => {
    const toShape = (top: number, bottom: number): DdayShape => ({ top, bottom, middle: (top + bottom) / 2, height: bottom - top });
    const measurePath = (path: SVGPathElement | undefined): DdayShape => {
      const toScreen = path?.getScreenCTM();
      if (!path || !toScreen) throw new Error("D-day 그림을 찾지 못했다");
      const { y, height } = path.getBBox();
      return toShape(y * toScreen.d + toScreen.f, (y + height) * toScreen.d + toScreen.f);
    };
    const [heart, plus] = [...element.querySelectorAll("svg path")].filter((path) => path instanceof SVGPathElement);
    const number = element.querySelector("p");
    const context = document.createElement("canvas").getContext("2d");
    if (!number || !context) throw new Error("D-day 숫자를 찾지 못했다");
    const probe = document.createElement("span");
    probe.style.cssText = "display:inline-block;width:0;height:0";
    number.append(probe);
    const baseline = probe.getBoundingClientRect().bottom;
    probe.remove();
    const { fontSize, fontFamily } = getComputedStyle(number);
    context.font = `${fontSize} ${fontFamily}`;
    const { actualBoundingBoxAscent, actualBoundingBoxDescent } = context.measureText(number.textContent ?? "");
    return {
      heart: measurePath(heart),
      plus: measurePath(plus),
      digits: toShape(baseline - actualBoundingBoxAscent, baseline + actualBoundingBoxDescent),
    };
  });

test.describe("홈 맨 위", () => {
  test("로고가 설정 버튼과 같은 줄 가운데에 있고 제목은 화면 읽기 프로그램이 그대로 읽는다", async ({ page, viewport }) => {
    await openScreen(page, "/", page.getByText(TODO.content));

    const group = await getDdayGroup(page).boundingBox();
    const settings = await page.getByRole("link", { name: "설정" }).boundingBox();
    expect(group).not.toBeNull();
    expect(settings).not.toBeNull();
    const groupMiddle = (group?.y ?? 0) + (group?.height ?? 0) / 2;
    expect(groupMiddle).toBeGreaterThanOrEqual(settings?.y ?? 0);
    expect(groupMiddle).toBeLessThanOrEqual((settings?.y ?? 0) + (settings?.height ?? 0));
    expect(settings?.width).toBeGreaterThanOrEqual(44);
    expect(settings?.height).toBeGreaterThanOrEqual(44);

    // 하트·+·숫자 묶음이 화면 가운데에 있고 설정 버튼과 겹치지 않는다
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

  test("하트와 숫자의 높이, 하트·+·숫자의 위아래 가운데가 맞고 숫자가 네 자리가 되어도 그대로다", async ({ page }) => {
    await openScreen(page, "/", page.getByText(TODO.content));
    const group = getDdayGroup(page);

    const before = await measureDdayShapes(group);
    expect(Math.abs(before.heart.height - before.digits.height)).toBeLessThanOrEqual(1.5);
    expect(Math.abs(before.heart.middle - before.digits.middle)).toBeLessThanOrEqual(DDAY_MIDDLE_TOLERANCE);
    expect(Math.abs(before.plus.middle - before.digits.middle)).toBeLessThanOrEqual(DDAY_MIDDLE_TOLERANCE);

    // 숫자마다 높이가 다른 글꼴이라, 네 자리로 바꿔도 하트가 위아래로 움직이지 않고 가운데가 맞는지 본다
    await group.locator("p").evaluate((number) => {
      number.textContent = "1208";
    });
    const after = await measureDdayShapes(group);
    expect(after.heart.top).toBeCloseTo(before.heart.top, 1);
    expect(Math.abs(after.heart.middle - after.digits.middle)).toBeLessThanOrEqual(DDAY_MIDDLE_TOLERANCE);

    // 네 자리여도 설정 버튼과 겹치지 않는다
    const groupBox = await group.boundingBox();
    const settings = await page.getByRole("link", { name: "설정" }).boundingBox();
    expect((groupBox?.x ?? 0) + (groupBox?.width ?? 0)).toBeLessThanOrEqual(settings?.x ?? 0);
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
