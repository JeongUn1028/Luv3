import { BASE_URL } from "./support/constants";
import { expect, test } from "./support/test";

// 사진 좌표의 동네 이름(#249). 가짜 응답 없이 빌드한 서버가 리포의 행정동 경계 파일을 읽어 계산하는지 본다.
// 서버 함수에 경계 파일을 싣는 설정은 Vercel에서만 드러나 단위 테스트(admdong-server.test.ts)가 맡는다
test.describe("좌표 → 동네 이름 경로", () => {
  test("국내 좌표면 행정동 이름을, 경계 밖이면 이름 없음을 돌려준다", async ({ page }) => {
    // Act
    const seongsu = await page.request.get("/api/places/region?lat=37.5444&lng=127.0396");
    const suwon = await page.request.get("/api/places/region?lat=37.2636&lng=127.0286");
    const paris = await page.request.get("/api/places/region?lat=48.8584&lng=2.2945");

    // Assert
    expect(seongsu.status()).toBe(200);
    expect(seongsu.headers()["cache-control"]).toBe("no-store");
    expect(await seongsu.json()).toEqual({ name: "성동구 성수1가1동" });
    expect(await suwon.json()).toEqual({ name: "수원시 팔달구 인계동" });
    expect(await paris.json()).toEqual({ name: null });
  });

  test("멤버가 아니면 동네 이름을 주지 않고 로그인 쪽으로 보낸다", async ({ browser }) => {
    // Arrange
    const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });

    try {
      // Act
      const response = await context.request.get(`${BASE_URL}/api/places/region?lat=37.5444&lng=127.0396`, { maxRedirects: 0 });

      // Assert
      expect(response.status()).toBe(307);
      expect(response.headers()["content-type"] ?? "").not.toContain("application/json");
    } finally {
      await context.close();
    }
  });
});
