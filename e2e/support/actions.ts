import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, type Request } from "@playwright/test";
import { toKstDate } from "@/lib/anniversary";
import { TODOS_PATH } from "@/lib/todos/list";
import { withJpegExif } from "@/test-utils/exif-image";
import { BASE_URL, PHOTO_FIXTURE_PATH } from "./constants";

// 여러 스펙이 함께 쓰는 화면 조작 도우미(#196). 화면은 숨긴 채 남아 있을 수 있어(Activity) 보이는 것만 고른다

const MINUTE_MS = 60_000;

/**
 * 홈 화면 앱으로 돌아온 것처럼 화면이 다시 보였다고 알린다(헤드리스 브라우저는 늘 보이는 상태라 알림만 보낸다).
 *
 * @example await returnToApp(page)
 */
export const returnToApp = (page: Page): Promise<void> => page.evaluate(() => void document.dispatchEvent(new Event("visibilitychange")));

/**
 * 한국 날짜로 어제(YYYY-MM-DD). 화면에서 저장하는 기록·일정을 오늘에 두면 나란히 도는 홈 테스트의 "최근 기록"·일정 자리를 잠깐 차지하므로 어제로 둔다.
 *
 * @example await pickDate(page, "#date", getKstYesterday())
 */
export const getKstYesterday = (): string => toKstDate(new Date(Date.now() - 24 * 60 * MINUTE_MS));

/**
 * 브라우저 시계를 한국 날짜로 오늘 0시 10분 전에 맞춘다. 로그인 토큰이 만료로 보이지 않게 지난 시각을 쓴다.
 * 그 뒤 `page.clock.fastForward`로 자정을 넘긴다.
 *
 * @example await installClockBeforeMidnight(page); await page.clock.fastForward(15 * 60_000);
 */
export const installClockBeforeMidnight = async (page: Page): Promise<void> => {
  await page.clock.install({ time: new Date(`${toKstDate(new Date())}T00:00:00+09:00`).getTime() - 10 * MINUTE_MS });
};

/**
 * 하단 탭의 링크.
 *
 * @example await getTab(page, "/todos").click()
 */
export const getTab = (page: Page, href: string): Locator => page.locator(`nav a[href="${href}"]`).locator("visible=true");

/**
 * 주소가 `href`인 보이는 링크.
 *
 * @example await getVisibleLink(page, `/dates/${id}`).tap()
 */
export const getVisibleLink = (page: Page, href: string): Locator => page.locator(`a[href="${href}"]`).locator("visible=true");

/**
 * `pickPhoto`가 고르는 사진에 넣는 위치(서울숲). 모음마다 위치가 있어야 저장되므로(#297) 기본으로 넣는다.
 * 실제 사진·위치는 공개 리포에 두지 않고 시험용 사진에 직접 넣는다
 */
export const PICKED_PHOTO_LOCATION = { lat: 37.5444, lng: 127.0374 };

/**
 * 기록 폼 사진 줄의 사진 버튼. 이름은 "모음 N의 M번째 사진"이고 대표 사진이면 뒤에 " (대표)"가 붙는다(#298).
 *
 * @example await getGroupPhoto(page, 1, 2).click() // 모음 1의 2번째 사진을 눌러 순서·대표·빼기를 연다
 */
export const getGroupPhoto = (page: Page, groupNumber: number, order: number): Locator =>
  page.getByRole("button", { name: new RegExp(`^모음 ${groupNumber}의 ${order}번째 사진`) }).locator("visible=true");

/**
 * 기록 폼에서 시험용 사진 한 장을 고르고, 폼의 사진이 모두 `order`장이 될 때까지 기다린다.
 * 기본으로 새 모음을 만들고, `groupNumber`를 주면 그 모음에 더한다(#298).
 * 사진 정보에 위치(`PICKED_PHOTO_LOCATION`)가 들어 있어 모음 위치가 채워지고, `hasLocation: false`면 위치 없는 사진을 고른다.
 *
 * @example await pickPhoto(page, 1); await pickPhoto(page, 2, { groupNumber: 1 })
 */
export const pickPhoto = async (
  page: Page,
  order: number,
  { hasLocation = true, groupNumber }: { hasLocation?: boolean; groupNumber?: number } = {},
): Promise<void> => {
  const fixture = readFileSync(PHOTO_FIXTURE_PATH);
  const buffer = hasLocation ? Buffer.from(withJpegExif(PICKED_PHOTO_LOCATION, fixture)) : fixture;
  const input = groupNumber ? page.getByLabel(`모음 ${groupNumber}에 더할 사진 고르기`) : page.getByLabel("사진 고르기", { exact: true });
  await input.setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer });
  await expect(page.getByRole("button", { name: /^모음 \d+의 \d+번째 사진/ }).locator("visible=true")).toHaveCount(order);
};

/**
 * 폼의 "저장" 버튼. 누른 뒤 "저장 중…"으로 바뀌면 찾지 못하므로, 저장하는 동안의 버튼을 볼 때는 `getSubmitButton`을 쓴다.
 *
 * @example await getSaveButton(page).click()
 */
export const getSaveButton = (page: Page): Locator => page.getByRole("button", { name: "저장", exact: true }).locator("visible=true");

/**
 * 화면 본문 폼의 제출 버튼. 글자가 "저장 중…"으로 바뀌어도 같은 버튼을 가리킨다.
 *
 * @example await expect(getSubmitButton(page)).toBeDisabled()
 */
export const getSubmitButton = (page: Page): Locator => page.locator('main button[type="submit"]').locator("visible=true");

/**
 * 이미 열린 로그인 화면에서 이메일과 비밀번호를 넣고 로그인을 누른다. 결과(홈으로 옮김, 오류 문구)는 부르는 쪽에서 기다린다.
 *
 * @example await submitSignIn(page, email, password)
 */
export const submitSignIn = async (page: Page, email: string, password: string): Promise<void> => {
  await page.getByLabel("이메일").fill(email);
  await page.getByLabel("비밀번호").fill(password);
  await page.getByRole("button", { name: "로그인" }).click();
};

/**
 * 로그인 화면을 열어 로그인을 누른다. 화면이 준비되기 전에 누르면 앱의 로그인 대신 브라우저 기본 제출이 일어나 다 불러올 때까지 기다린다.
 *
 * @example await signIn(page, email, wrongPassword) // 홈까지 기다릴 때는 signInToHome
 */
export const signIn = async (page: Page, email: string, password: string): Promise<void> => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await submitSignIn(page, email, password);
};

/**
 * 로그인 화면을 열어 로그인하고 홈으로 옮길 때까지 기다린다.
 *
 * @example await signInToHome(page, email, password)
 */
export const signInToHome = async (page: Page, email: string, password: string): Promise<void> => {
  await signIn(page, email, password);
  await page.waitForURL(`${BASE_URL}/`);
};

/**
 * 미리 받기가 아닌 화면 요청(이동과 다시 불러오기)인지. Next가 화면 내용(RSC)을 받는 요청만 고른다.
 *
 * @example page.on("request", (request) => isScreenRequest(request, TODOS_PATH) && refreshes.push(request))
 */
export const isScreenRequest = (request: Request, pathname: string): boolean => {
  const headers = request.headers();
  return headers["rsc"] === "1" && headers["next-router-prefetch"] === undefined && new URL(request.url()).pathname === pathname;
};

/**
 * 홈의 보이는 커플 사진.
 *
 * @example await expectImageLoaded(getCouplePhoto(page))
 */
export const getCouplePhoto = (page: Page): Locator => page.getByRole("img", { name: "커플 사진" }).locator("visible=true");

/**
 * 사진을 실제로 받아 그릴 때까지 기다린다. 깨진 사진은 `naturalWidth`가 0이다.
 *
 * @example await expectImageLoaded(page.getByRole("img", { name: title }).locator("visible=true"))
 */
export const expectImageLoaded = (image: Locator): Promise<void> =>
  expect.poll(() => image.evaluate((element: HTMLImageElement) => element.complete && element.naturalWidth > 0)).toBe(true);

/**
 * 할 일 저장이 실패한 뒤 목록 위쪽 알림의 "돌아가기"로 폼에 돌아간다.
 * 할 일은 저장을 기다리지 않고 바로 목록으로 돌아가므로(#345) 실패는 폼이 아니라 위쪽 알림이 먼저 알린다.
 *
 * @example await returnToFailedTodoForm(page, "/todos/new")
 */
export const returnToFailedTodoForm = async (page: Page, formPath: string): Promise<void> => {
  await page.waitForURL(`**${TODOS_PATH}`);
  const notice = page.getByRole("alert").filter({ hasText: "하고 싶은 것을 저장하지 못했어요" });
  await notice.getByRole("link", { name: "돌아가기" }).tap();
  await page.waitForURL(`**${formPath}`);
};
