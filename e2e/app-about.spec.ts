import packageJson from "../package.json";
import { SETTINGS_ABOUT_PATH, SETTINGS_PATH } from "@/lib/auth/paths";
import { expect, openScreen, test } from "./support/test";

test.describe("앱 정보", () => {
  test("설정 맨 아래 줄에 지금 버전이 보이고, 누르면 앱 정보가 열린다", async ({ page }) => {
    // Arrange
    const appRow = page.getByRole("link", { name: `앱 정보 v${packageJson.version}` });
    await openScreen(page, SETTINGS_PATH, appRow);

    // 출처는 앱 정보로 옮겨 설정에는 없다(#434)
    await expect(page.getByRole("heading", { name: "데이터 출처" })).toHaveCount(0);

    // Act
    await appRow.click();

    // Assert
    await page.waitForURL(`**${SETTINGS_ABOUT_PATH}`);
    await expect(page.getByRole("heading", { level: 1, name: "앱 정보" })).toBeVisible();
    await expect(page.getByText(`버전 ${packageJson.version}`)).toBeVisible();
    for (const name of ["업데이트 기록", "함께 쓰는 서비스", "자료 출처", "글꼴", "만든 사람"]) {
      await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
    }
    await expect(page.getByText("우리 둘이 쓰려고 만들었어요")).toBeVisible();
  });

  test("업데이트 기록은 GitHub에서 받은 버전 목록이나, 받지 못했다는 안내 중 하나를 보여 준다", async ({ page }) => {
    // Arrange & Act
    await openScreen(page, SETTINGS_ABOUT_PATH, page.getByRole("heading", { name: "업데이트 기록" }));

    // Assert: 바깥 서비스라 CI에서 받지 못할 수 있다. 어느 쪽이든 칸이 비지 않는다
    const releases = page.locator("details");
    const failed = page.getByText("지금은 업데이트 기록을 불러오지 못했어요.");
    await expect(releases.first().or(failed)).toBeVisible();
    if ((await releases.count()) > 0) {
      // 지금 버전만 펼쳐 둔다
      const openReleases = page.locator("details[open]");
      await expect(openReleases).toHaveCount((await page.getByText("지금 버전").count()) > 0 ? 1 : 0);
    }
  });
});
