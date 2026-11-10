import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { PHOTO_RECORD } from "./support/constants";
import { expect, test } from "./support/test";
import type { Page } from "@playwright/test";

// 보안 헤더(#170). 빌드한 앱에 헤더가 붙고, 주요 화면이 CSP에 막히는 것 없이 그려지는지 본다.
// 카카오 지도는 E2E가 가짜 SDK로 대신해 실제 지도 파일·그림 주소는 여기서 확인하지 못한다(README "보안 헤더")

const SCREENS = ["/", RECORDS_PATH, `/dates/${PHOTO_RECORD.id}`, CALENDAR_PATH, TODOS_PATH, "/settings"];

test("응답에 CSP와 기본 보안 헤더가 붙는다", async ({ page }) => {
  // Act
  const response = await page.goto("/");

  // Assert
  const headers = response?.headers() ?? {};
  expect(headers["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
});

/** 크롬은 CSP가 막은 자원을 콘솔 오류로 알린다 */
const collectViolations = (page: Page): string[] => {
  const violations: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("Content Security Policy")) violations.push(message.text());
  });
  return violations;
};

/** 화면 안에 보이는 사진(서명 주소로 받는 Supabase 사진 포함)을 다 받을 때까지 기다린다. 아래쪽 지연 로딩 사진은 요청되지 않으므로 뺀다 */
const waitForVisibleImages = (page: Page): Promise<void> =>
  expect
    .poll(() =>
      page.evaluate(() =>
        Array.from(document.images)
          .filter((image) => {
            const box = image.getBoundingClientRect();
            return box.width > 0 && box.bottom > 0 && box.top < window.innerHeight;
          })
          .every((image) => image.complete),
      ),
    )
    .toBe(true);

for (const path of SCREENS) {
  test(`${path} 화면은 CSP에 막히는 스크립트·사진·요청 없이 그려진다`, async ({ page }) => {
    // Arrange
    const violations = collectViolations(page);

    // Act
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    await waitForVisibleImages(page);

    // Assert
    expect(violations).toEqual([]);
  });
}

test.describe("로그인하지 않은 상태에서", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("로그인 화면은 시작 화면 스크립트·글꼴이 CSP에 막히지 않고 그려진다", async ({ page }) => {
    // Arrange
    const violations = collectViolations(page);

    // Act
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "로그인" })).toBeVisible();
    await page.evaluate(async () => {
      await document.fonts.ready;
    });

    // Assert
    expect(violations).toEqual([]);
  });
});
