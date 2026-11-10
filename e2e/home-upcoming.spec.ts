import { randomUUID } from "node:crypto";
import { toKstDate } from "../src/lib/anniversary";
import { toCalendarHref } from "../src/lib/calendar/month";
import { E2E_EVENTS } from "./support/constants";
import { createDisposableEvent } from "./support/seed";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

test.describe("홈 다음 일정 칸", () => {
  test("일정마다 언제인지 쓰고, 칸의 링크는 첫 일정의 날짜를 연다", async ({ page }) => {
    // Arrange: 공통 일정 2개는 오늘 종일이고 가장 먼저 만들어져 칸의 맨 앞에 온다
    const today = toKstDate(new Date());
    await openScreen(page, "/", page.getByText(E2E_EVENTS[0].title));
    const tile = page.getByRole("region", { name: "다음 일정" });

    // Assert
    await expect(tile.getByRole("listitem")).toHaveCount(2);
    for (const { title } of E2E_EVENTS) await expect(tile.getByRole("listitem").filter({ hasText: title })).toContainText("오늘");
    await expect(tile.getByRole("link")).toHaveAttribute("href", toCalendarHref({ date: today }));
    const box = await tile.boundingBox();
    expect(Math.abs((box?.width ?? 0) - (box?.height ?? 0))).toBeLessThanOrEqual(1);
    expect((await getScrollAreaOverflow(page)).vertical).toBe(0);
  });

  test("오늘 일정이 칸보다 많으면 못 넣은 수를 쓰고 칸이 정사각형을 유지한다", async ({ page }, testInfo) => {
    // Arrange: 만든 순서가 뒤라 공통 일정을 밀어내지 않는다
    const deleteEvent = await createDisposableEvent({ id: randomUUID(), title: createTestName("E2E 칸 밖 일정", testInfo) });

    try {
      // Act
      await openScreen(page, "/", page.getByText(/^외 \d+개$/));
      const tile = page.getByRole("region", { name: "다음 일정" });

      // Assert
      const box = await tile.boundingBox();
      expect(Math.abs((box?.width ?? 0) - (box?.height ?? 0))).toBeLessThanOrEqual(1);
      expect((await getScrollAreaOverflow(page)).vertical).toBe(0);
    } finally {
      await deleteEvent();
    }
  });
});
