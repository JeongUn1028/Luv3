import { randomUUID } from "node:crypto";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { E2E_MEMBER } from "./support/constants";
import { createDisposableAuthorEvent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 일정 주인 이름은 누가 만든 일정인지에 맞게 쓴다(#195에서 코드 글자 검사를 옮김)

test.describe("일정 주인 이름", () => {
  test("일정 추가 폼의 한 사람 선택지는 내 닉네임으로 쓴다", async ({ page }) => {
    // Act
    await openScreen(page, "/events/new", page.locator("#event-memo"));

    // Assert
    await expect(page.getByRole("radio", { name: E2E_MEMBER.nickname, exact: true }).locator("visible=true")).toHaveCount(1);
  });

  test("상대가 만든 일정을 고치면 한 사람 선택지에 내 닉네임 대신 상대 닉네임을 쓴다", async ({ page }, testInfo) => {
    // Arrange: 상대 일정에 내 이름을 붙이면 사실과 달라진다
    const id = randomUUID();
    const nickname = `상대${randomUUID().slice(0, 4)}`;
    const deleteEvent = await createDisposableAuthorEvent({ id, title: `E2E 상대 일정 ${testInfo.project.name}`, nickname });

    try {
      // Act
      await openScreen(page, `/events/${id}/edit`, page.locator("#event-memo"));

      // Assert
      const choices = page.locator("main").locator("visible=true");
      await expect(choices.getByRole("radio", { name: nickname, exact: true })).toBeChecked();
      await expect(choices.getByRole("radio", { name: E2E_MEMBER.nickname, exact: true })).toHaveCount(0);
    } finally {
      await deleteEvent();
    }
  });

  test("캘린더 범례는 보는 사람 닉네임 대신 개인 일정이라고 쓴다", async ({ page }) => {
    // Arrange: 크림색은 두 사람 일정에 모두 칠해져, 보는 사람 닉네임을 쓰면 상대 일정까지 내 일정처럼 읽힌다
    await openScreen(page, CALENDAR_PATH, page.locator('button[aria-pressed="true"]'));

    // Assert
    const legend = page.locator("main p").filter({ hasText: "데이트 기록" }).locator("visible=true");
    await expect(legend).toContainText("함께 일정");
    await expect(legend).toContainText("개인 일정");
    await expect(legend).not.toContainText(`${E2E_MEMBER.nickname} 일정`);
  });
});
