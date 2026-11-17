import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { LOGIN_PATH, SIGN_OUT_PATH } from "@/lib/auth/paths";
import { NOT_MEMBER_MESSAGE } from "@/lib/auth/login-messages";
import { BASE_URL, E2E_EVENTS, E2E_TODOS, PHOTO_RECORD } from "./support/constants";
import { signIn, submitSignIn } from "./support/actions";
import { createNonMemberAccount } from "./support/seed";
import { expect, test } from "./support/test";

// 허용목록(members) 밖 계정은 로그인해도 들어오지 못한다(#414). 홈을 그리는 getCurrentMember가 로그아웃 경로로 보내고,
// 로그아웃 경로(GET /auth/signout)가 한 번 더 확인한 뒤 로그아웃시킨다. 다시 로그인 창(#102)으로 막는 길은 session-lost.spec이 맡는다

const getAuthCookies = async (page: Page) => (await page.context().cookies()).filter(({ name }) => name.includes("auth-token"));

test.describe("허용목록 밖 계정", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("로그인 화면에서 로그인하면 로그아웃시키고 허용된 계정이 아니라고 알린다", async ({ page }) => {
    // Arrange
    const email = `e2e-outsider-${randomUUID()}@example.com`;
    const password = randomUUID();
    const deleteAccount = await createNonMemberAccount(email, password);

    try {
      // Act
      await signIn(page, email, password);

      // Assert
      // 경로 처리기는 요청 주소를 서버 이름(localhost)으로 받아 보내므로, 주소의 호스트는 보지 않는다
      await page.waitForURL(`**${LOGIN_PATH}?error=not_member`);
      await expect(page.locator("main").getByRole("alert")).toHaveText(NOT_MEMBER_MESSAGE);
      expect(await getAuthCookies(page)).toEqual([]);
      // 로그아웃됐으므로 홈을 열면 허용목록 확인 없이 그냥 로그인 화면으로 간다(로그인한 채면 다시 not_member가 붙는다)
      await page.goto("/");
      await page.waitForURL((url) => url.pathname === LOGIN_PATH && !url.searchParams.has("error"));
    } finally {
      await deleteAccount();
    }
  });
});

// 조회가 있는 화면은 허용목록 확인과 조회를 함께 시작한다(#411). 조회가 먼저 끝나도 화면을 그리지 않고 확인의 이동을 따라야 한다
const PAGES_WITH_LOAD = [
  "/dates/new",
  `/dates/${PHOTO_RECORD.id}/edit`,
  `/events/${E2E_EVENTS[0].id}/edit`,
  `/todos/${E2E_TODOS[0].id}/edit`,
  "/settings/trash",
  // 휴지통 사진은 어떤 id든 회원 확인이 먼저다. 테스트 이름에 들어가므로 실행마다 같은 값을 쓴다(작업자마다 이름이 같아야 한다)
  "/settings/trash/e2e00000-0000-4000-8000-0000000000ff",
  "/records/map",
] as const;

test.describe("허용목록 밖 계정이 조회가 있는 화면을 바로 열면", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  for (const path of PAGES_WITH_LOAD) {
    test(`${path}: 로그아웃시키고 허용된 계정이 아니라고 알린다`, async ({ page }) => {
      // Arrange
      const email = `e2e-outsider-${randomUUID()}@example.com`;
      const password = randomUUID();
      const deleteAccount = await createNonMemberAccount(email, password);

      try {
        // Act: 로그인 뒤 그 화면으로 돌아가게 한다
        await page.goto(`${LOGIN_PATH}?next=${encodeURIComponent(path)}`, { waitUntil: "networkidle" });
        await submitSignIn(page, email, password);

        // Assert
        await page.waitForURL(`**${LOGIN_PATH}?error=not_member`);
        await expect(page.locator("main").getByRole("alert")).toHaveText(NOT_MEMBER_MESSAGE);
        expect(await getAuthCookies(page)).toEqual([]);
      } finally {
        await deleteAccount();
      }
    });
  }
});

// 다른 사이트의 링크로 로그아웃 경로가 열려도 허용된 사람은 로그아웃되지 않는다
test("허용된 사람이 허용목록 밖 계정을 내보내는 주소를 열면 로그아웃하지 않고 홈으로 돌아간다", async ({ page }) => {
  // Arrange
  expect(await getAuthCookies(page)).not.toEqual([]);

  // Act: getCurrentMember가 보내는 주소(NOT_MEMBER_SIGNOUT_PATH, 서버 전용 파일이라 불러오지 못한다).
  // 경로 처리기는 서버 이름(localhost)으로 보내 따라가면 쿠키가 없는 호스트가 되므로, 보내는 응답만 본다
  const response = await page.request.get(`${SIGN_OUT_PATH}?reason=not_member`, { maxRedirects: 0 });

  // Assert
  expect(response.status()).toBe(307);
  expect(new URL(response.headers()["location"] ?? "").pathname).toBe("/");
  expect(await getAuthCookies(page)).not.toEqual([]);
  await page.goto("/");
  await page.waitForURL(`${BASE_URL}/`);
});
