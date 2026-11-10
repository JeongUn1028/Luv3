import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { PHOTO_RECORD } from "./support/constants";
import { expect, test } from "./support/test";

// 보안 헤더(#170). 빌드한 앱에 헤더가 붙고, 주요 화면이 CSP에 막히는 것 없이 그려지는지 본다.
// 카카오 지도는 record-map.spec.ts가 같은 헤더 아래에서 SDK 주소로 불러 확인한다

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

for (const path of SCREENS) {
  test(`${path} 화면은 CSP에 막히는 스크립트·사진·요청 없이 그려진다`, async ({ page }) => {
    // Arrange: 크롬은 막은 자원을 콘솔 오류로 알린다
    const violations: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("Content Security Policy")) violations.push(message.text());
    });

    // Act
    await page.goto(path);
    await expect(page.locator("main").first()).toBeVisible();
    // 서명 주소로 받는 사진(Supabase)까지 다 받은 뒤에 본다
    await expect.poll(() => page.evaluate(() => Array.from(document.images).every((image) => image.complete))).toBe(true);

    // Assert
    expect(violations).toEqual([]);
  });
}
