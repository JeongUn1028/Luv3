import { readFileSync } from "node:fs";
import type { Locator, Page } from "@playwright/test";
import { BASE_URL, PHOTO_FIXTURE_PATH } from "./constants";

// 여러 스펙이 함께 쓰는 화면 조작 도우미(#196). 화면은 숨긴 채 남아 있을 수 있어(Activity) 보이는 것만 고른다

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
 * 기록 폼에서 시험용 사진 한 장을 고르고, `order`번째 사진으로 목록에 붙을 때까지 기다린다.
 *
 * @example await pickPhoto(page, 1)
 */
export const pickPhoto = async (page: Page, order: number): Promise<void> => {
  await page.getByLabel("사진 고르기").setInputFiles({ name: "photo.jpg", mimeType: "image/jpeg", buffer: readFileSync(PHOTO_FIXTURE_PATH) });
  await page.getByRole("button", { name: `${order}번째 사진 빼기` }).waitFor();
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
