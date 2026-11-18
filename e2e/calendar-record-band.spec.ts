import { randomUUID } from "node:crypto";
import type { Locator, Page, TestInfo } from "@playwright/test";
import { createDisposableEvent, createDisposableRecord } from "./support/seed";
import { expect, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

// 다른 테스트가 쓰지 않는 지난 달과 그 앞 달. 기기마다 달을 나눠 두 기기가 함께 돌아도(main 머지 때) 칸이 섞이지 않는다
const getMonths = (testInfo: TestInfo): { month: string; previousMonth: string } =>
  testInfo.project.name === "iphone-17" ? { month: "2012-04", previousMonth: "2012-03" } : { month: "2012-03", previousMonth: "2012-02" };

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

/** 칸 안에 그린 것의 수. 띠가 있는 날은 띠와 날짜 숫자 둘뿐이어야 한다(예전에는 기록 점이 더 있었다) */
const countCellMarks = (cell: Locator): Promise<number> => cell.locator(":scope > span").count();

test.describe("캘린더 기록 띠(#461)", () => {
  test("일정 없이 남긴 기록이 있는 날은 점 없이 분홍 띠를 칠하고, 기간 기록은 모든 날, 한 사람 일정과 겹쳐도 분홍이다", async ({ page }, testInfo) => {
    // Arrange
    const { month } = getMonths(testInfo);
    const title = createTestName("E2E 기록 띠", testInfo);
    const cleanups: (() => Promise<void>)[] = [];

    try {
      cleanups.push(await createDisposableRecord({ id: randomUUID(), title: `${title} 하루`, date: `${month}-05` }));
      cleanups.push(await createDisposableRecord({ id: randomUUID(), title: `${title} 기간`, date: `${month}-12`, endDate: `${month}-14` }));
      cleanups.push(await createDisposableRecord({ id: randomUUID(), title: `${title} 겹침`, date: `${month}-20` }));
      cleanups.push(await createDisposableEvent({ id: randomUUID(), title: `${title} 개인`, date: `${month}-20`, isTogether: false }));
      cleanups.push(await createDisposableEvent({ id: randomUUID(), title: `${title} 개인만`, date: `${month}-22`, isTogether: false }));
      // 함께 일정에서 남긴 기록인데 나중에 그 일정을 한 사람 일정으로 바꾼 경우다. 기록 줄은 일정 줄로 합쳐져도 기록이 있는 날이라 분홍이다
      const changedEventId = randomUUID();
      cleanups.push(await createDisposableEvent({ id: changedEventId, title: `${title} 바뀐 일정`, date: `${month}-25`, isTogether: false }));
      cleanups.push(
        await createDisposableRecord({ id: randomUUID(), title: `${title} 바뀐 일정 기록`, date: `${month}-25`, eventLink: { eventId: changedEventId, eventDate: `${month}-25` } }),
      );

      // Act
      await openScreen(page, `/calendar?month=${month}&date=${month}-01`, getDayCell(page, `${month}-05`));

      // Assert
      const kinds = Object.fromEntries(
        await Promise.all(["05", "12", "13", "14", "20", "22", "25", "06"].map(async (day) => [day, await getBandKind(getDayCell(page, `${month}-${day}`))])),
      );
      expect(kinds).toEqual({ "05": "together", "12": "together", "13": "together", "14": "together", "20": "together", "22": "personal", "25": "together", "06": "none" });
      expect(await countCellMarks(getDayCell(page, `${month}-05`))).toBe(2);
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
    const { month, previousMonth } = getMonths(testInfo);
    const title = createTestName("E2E 넘긴 달 띠", testInfo);
    const deleteRecord = await createDisposableRecord({ id: randomUUID(), title, date: `${month}-08` });

    try {
      await openScreen(page, `/calendar?month=${previousMonth}&date=${previousMonth}-01`, page.getByRole("link", { name: "다음 달" }));

      // Act
      await page.getByRole("link", { name: "다음 달" }).locator("visible=true").click();
      const cell = getDayCell(page, `${month}-08`);
      await expect(cell).toHaveAttribute("aria-label", /기록 1개/);

      // Assert
      expect(await getBandKind(cell)).toBe("together");
      expect(await countCellMarks(cell)).toBe(2);
    } finally {
      await deleteRecord();
    }
  });
});
