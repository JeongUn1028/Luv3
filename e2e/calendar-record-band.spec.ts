import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { createDisposableEvent, createDisposableRecord } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

// 다른 테스트가 쓰지 않는 지난 달. 기기마다 달을 나눠 두 기기가 함께 돌아도(main 머지 때) 칸이 섞이지 않는다
const getMonth = (testInfo: TestInfo): string => (testInfo.project.name === "iphone-17" ? "2012-04" : "2012-03");

/** 그 날짜의 달력 칸. 날짜 버튼 이름은 "M월 D일 …"로 시작한다 */
const getDayCell = (page: Page, date: string): Locator => {
  const [, month, day] = date.split("-").map(Number);
  return page.getByRole("button", { name: new RegExp(`^${month}월 ${day}일 `) }).locator("visible=true");
};

/** 칸에 칠한 형광펜. 분홍(함께)·크림색(한 사람) 중 무엇인지 띠의 배경 클래스로 가린다 */
const getBandKind = async (cell: Locator): Promise<string> => {
  const bands = cell.locator('span[aria-hidden="true"].absolute');
  if ((await bands.count()) === 0) return "none";
  const className = (await bands.first().getAttribute("class")) ?? "";
  if (className.includes("bg-highlight")) return "together";
  if (className.includes("bg-cream")) return "personal";
  return "unknown";
};

/** 칸 안의 둥근 점(예전 기록 표시) 수 */
const countDots = (cell: Locator): Promise<number> => cell.locator("span.rounded-full.size-1\\.5").count();

test.describe("캘린더 기록 띠(#461)", () => {
  test("일정 없이 남긴 기록이 있는 날은 점 없이 분홍 띠를 칠하고, 기간 기록은 모든 날, 한 사람 일정과 겹쳐도 분홍이다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    const title = createTestName("E2E 기록 띠", testInfo);
    const cleanups = [
      await createDisposableRecord({ id: randomUUID(), title: `${title} 하루`, date: `${month}-05` }),
      await createDisposableRecord({ id: randomUUID(), title: `${title} 기간`, date: `${month}-12`, endDate: `${month}-14` }),
      await createDisposableRecord({ id: randomUUID(), title: `${title} 겹침`, date: `${month}-20` }),
      await createDisposableEvent({ id: randomUUID(), title: `${title} 개인`, date: `${month}-20`, isTogether: false }),
      await createDisposableEvent({ id: randomUUID(), title: `${title} 개인만`, date: `${month}-22`, isTogether: false }),
    ];

    try {
      // Act
      await openScreen(page, `/calendar?month=${month}&date=${month}-01`, getDayCell(page, `${month}-05`));

      // Assert
      const kinds = Object.fromEntries(
        await Promise.all(["05", "12", "13", "14", "20", "22", "06"].map(async (day) => [day, await getBandKind(getDayCell(page, `${month}-${day}`))])),
      );
      expect(kinds).toEqual({ "05": "together", "12": "together", "13": "together", "14": "together", "20": "together", "22": "personal", "06": "none" });
      expect(await countDots(getDayCell(page, `${month}-05`))).toBe(0);
      // 화면 읽기 프로그램은 계획과 기록을 구분해 듣도록 그대로 기록 수를 알린다
      await expect(getDayCell(page, `${month}-05`)).toHaveAttribute("aria-label", /기록 1개/);
      const legend = page.locator("main p").filter({ hasText: "기념일" }).locator("visible=true");
      await expect(legend).toContainText("함께 일정·기록");
      await expect(legend).not.toContainText("데이트 기록");
    } finally {
      for (const cleanup of cleanups.reverse()) await cleanup();
    }
  });

  test("달을 넘겨 브라우저가 받아 채운 달도 기록이 있는 날에 같은 분홍 띠를 칠한다", async ({ page }, testInfo) => {
    // Arrange
    const month = getMonth(testInfo);
    const title = createTestName("E2E 넘긴 달 띠", testInfo);
    const deleteRecord = await createDisposableRecord({ id: randomUUID(), title, date: `${month}-08` });
    const [year, monthNumber] = month.split("-").map(Number);
    const previousMonth = `${year}-${String((monthNumber ?? 1) - 1).padStart(2, "0")}`;

    try {
      await openScreen(page, `/calendar?month=${previousMonth}&date=${previousMonth}-01`, page.getByRole("link", { name: "다음 달" }));

      // Act
      await page.getByRole("link", { name: "다음 달" }).locator("visible=true").click();
      const cell = getDayCell(page, `${month}-08`);
      await expect(cell).toHaveAttribute("aria-label", /기록 1개/);

      // Assert
      expect(await getBandKind(cell)).toBe("together");
      expect(await countDots(cell)).toBe(0);
    } finally {
      await deleteRecord();
    }
  });
});
