import { SETTINGS_PATH } from "@/lib/auth/paths";
import { STARTUP_TIMING_STORAGE_KEY } from "@/lib/pwa/startup-timing";
import { expect, openScreen, test } from "./support/test";

// TODO(#202): 휴대폰 측정이 끝나 측정 표시를 지울 때 함께 지운다

test.describe("앱 켜는 시간 측정(임시)", () => {
  test("앱을 켜면 단계별 시간을 남기고, 앱 안에서 설정으로 옮겨도 기록이 늘지 않는다", async ({ page }) => {
    // Arrange: 로그인 상태를 만들 때 연 로그인 화면의 기록이 저장 상태에 들어 있어 문서를 열 때마다 비운다
    await page.addInitScript((key) => window.localStorage.removeItem(key), STARTUP_TIMING_STORAGE_KEY);

    // Act
    await openScreen(page, "/", page.getByRole("link", { name: "설정" }));
    await page.getByRole("link", { name: "설정" }).click();
    await page.waitForURL(`**${SETTINGS_PATH}`);

    // Assert
    const section = page.getByRole("region", { name: "앱 켜는 시간 측정(임시)" }).locator("visible=true");
    const rows = section.getByRole("listitem");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(/첫 그림 \d+\.\d{2}초/);
    await expect(rows.first()).toContainText(/서버 응답 \d+\.\d{2}초/);
    await expect(rows.first()).toContainText(/CSS \d+개 중 \d+개 새로 받음/);
    await expect(rows.first()).toContainText("브라우저 · /");
  });
});
