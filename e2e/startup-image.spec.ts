import { expect, test } from "./support/test";

test.describe("아이폰 앱 시작 화면", () => {
  // 홈 화면 추가는 로그인 전에도 하므로 세션 없이 잰다
  test.use({ storageState: { cookies: [], origins: [] } });

  test("지금 기기에 맞는 이미지를 딱 하나 고르고 로그인 없이 화면과 같은 크기의 앱 배경색 이미지로 열린다", async ({ page, viewport }) => {
    await page.goto("/login");

    await expect(page.locator('head meta[name="apple-mobile-web-app-capable"]')).toHaveAttribute("content", "yes");
    const matched = await page
      .locator('head link[rel="apple-touch-startup-image"]')
      .evaluateAll((links) => links.filter((link) => window.matchMedia(link.getAttribute("media") ?? "").matches).map((link) => link.getAttribute("href")));
    expect(matched).toHaveLength(1);

    const image = await page.evaluate(async (source) => {
      const element = new Image();
      element.src = source ?? "";
      await element.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const context = canvas.getContext("2d");
      context?.drawImage(element, 0, 0);
      const corner = context?.getImageData(0, 0, 1, 1).data;
      // 이미지 모서리와 앱 배경색을 같은 방법으로 읽어 비교한다
      const body = document.createElement("canvas").getContext("2d");
      if (body) body.fillStyle = getComputedStyle(document.body).backgroundColor;
      return {
        width: element.naturalWidth,
        height: element.naturalHeight,
        corner: corner ? `#${[...corner].slice(0, 3).map((value) => value.toString(16).padStart(2, "0")).join("")}` : "",
        background: body ? String(body.fillStyle) : "",
      };
    }, matched[0]);
    expect({ width: image.width, height: image.height }).toEqual({ width: (viewport?.width ?? 0) * 3, height: (viewport?.height ?? 0) * 3 });
    // 시작 화면과 앱이 같은 색이어야 켤 때 번쩍이지 않는다
    expect(image.corner).toBe(image.background);
  });

  test("서버가 보낸 HTML에 앱 배경색이 들어 있어 CSS가 오기 전에도 어둡다", async ({ page }) => {
    const response = await page.goto("/login");

    expect(await response?.text()).toMatch(/<html[^>]*style="background-color:/);
    const colors = await page.evaluate(() => ({
      html: getComputedStyle(document.documentElement).backgroundColor,
      body: getComputedStyle(document.body).backgroundColor,
    }));
    expect(colors.html).toBe(colors.body);
  });
});
