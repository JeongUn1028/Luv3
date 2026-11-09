import { randomUUID } from "node:crypto";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { RECORDS_PATH } from "@/lib/dates/album";
import { TODOS_PATH } from "@/lib/todos/list";
import { expect, openScreen, test } from "./support/test";

// 없는 화면 안내와 로딩 뼈대(#195에서 코드 글자 검사를 옮김)

const MISSING_SCREENS = [
  { name: "없는 주소", path: "/e2e-missing", title: "화면을 찾을 수 없어요", description: "없어졌거나 주소가 잘못됐어요.", link: "홈으로", target: "/" },
  { name: "없는 기록", path: `/dates/${randomUUID()}`, title: "기록을 찾을 수 없어요", description: "지워졌거나 주소가 잘못됐어요.", link: "기록 목록으로", target: RECORDS_PATH },
  { name: "없는 일정", path: `/events/${randomUUID()}/edit`, title: "일정을 찾을 수 없어요", description: "지워졌거나 주소가 잘못됐어요.", link: "캘린더로", target: CALENDAR_PATH },
  { name: "없는 항목", path: `/todos/${randomUUID()}/edit`, title: "항목을 찾을 수 없어요", description: "지워졌거나 주소가 잘못됐어요.", link: "목록으로", target: TODOS_PATH },
];

test.describe("없는 화면", () => {
  for (const { name, path, title, description, link, target } of MISSING_SCREENS) {
    test(`${name} 화면을 열면 안내와 돌아갈 링크를 보여 주고, 누르면 그 화면으로 간다`, async ({ page }) => {
      // Arrange
      await openScreen(page, path, page.getByRole("heading", { name: title }));

      // Act
      await expect(page.getByText(description).locator("visible=true")).toBeVisible();
      await page.getByRole("link", { name: link, exact: true }).locator("visible=true").tap();

      // Assert
      await page.waitForURL((url) => url.pathname === target);
    });
  }
});

test.describe("로딩 뼈대", () => {
  for (const path of ["/", RECORDS_PATH, "/settings"]) {
    test(`${path} 화면을 기다리는 동안 화면 읽기 프로그램에 불러오는 중이라고 알린다`, async ({ browser, context, viewport }) => {
      // Arrange: JavaScript를 끄면 스트리밍된 내용이 끼워지지 않아 뼈대가 그대로 남는다
      const skeletonContext = await browser.newContext({ viewport, storageState: await context.storageState(), javaScriptEnabled: false });
      const page = await skeletonContext.newPage();

      try {
        // Act
        await page.goto(path);

        // Assert
        await expect(page.locator("main").getByRole("status").filter({ hasText: "불러오는 중이에요" }).first()).toBeAttached();
      } finally {
        await skeletonContext.close();
      }
    });
  }
});
