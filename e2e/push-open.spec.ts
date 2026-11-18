import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { SETTINGS_PATH } from "@/lib/auth/paths";
import { RECORDS_PATH } from "@/lib/dates/album";
import { PUSH_OPEN_MESSAGE } from "@/lib/push/message";
import { TODOS_PATH } from "@/lib/todos/list";
import { getTab } from "./support/actions";
import { createTestName } from "./support/names";
import { createDisposableTodo } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 앱을 켜 둔 채 알림을 누르면(#406) 서비스 워커(public/sw.js)가 앱 창에 주소를 넘기고, 앱이 받았다고 답하면 창을 옮기지 않는다.
// 실제 알림 누르기는 Playwright로 만들 수 없어, 서비스 워커가 보내는 것과 같은 메시지를 앱 창에 보낸다.
// 서비스 워커 쪽(답이 없으면 창 옮기기)은 src/lib/push/service-worker.test.ts가 맡는다

const getTodoContent = (page: Page): Locator => page.locator("#todo-content").locator("visible=true");

/** 서비스 워커처럼 앱 창에 주소 메시지를 보내고, 앱이 함께 넘긴 포트로 답한 내용을 돌려준다(1초 안에 답이 없으면 undefined) */
const sendPushOpenMessage = (page: Page, url: string): Promise<unknown> =>
  page.evaluate(
    ({ type, url: href }) =>
      new Promise<unknown>((resolve) => {
        const channel = new MessageChannel();
        const timer = setTimeout(() => resolve(undefined), 1000);
        channel.port1.onmessage = (event: MessageEvent<unknown>) => {
          clearTimeout(timer);
          resolve(event.data);
        };
        navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type, url: href }, ports: [channel.port2] }));
      }),
    { type: PUSH_OPEN_MESSAGE, url },
  );

test.describe("앱을 켜 둔 채 알림 누르기", () => {
  test("쓰던 폼에서 알림 주소를 받으면 앱 안에서 옮기고, 돌아오면 쓰던 내용이 남아 있다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/todos/new", getTodoContent(page));
    await getTodoContent(page).fill("알림 오기 전에 쓰던 하고 싶은 것");
    // 문서를 새로 열면 사라지는 표시. 창을 통째로 옮기지 않았는지 본다
    await page.evaluate(() => Object.assign(window, { pushOpenMarker: true }));

    // Act
    const reply = await sendPushOpenMessage(page, new URL(SETTINGS_PATH, page.url()).href);

    // Assert
    expect(reply).toEqual({ type: PUSH_OPEN_MESSAGE });
    await page.waitForURL(`**${SETTINGS_PATH}`);
    await page.goBack();
    await page.waitForURL("**/todos/new");
    await expect(getTodoContent(page)).toHaveValue("알림 오기 전에 쓰던 하고 싶은 것");
    expect(await page.evaluate(() => (window as unknown as { pushOpenMarker?: boolean }).pushOpenMarker)).toBe(true);
  });

  // 탭 화면은 받은 지 30초가 안 됐으면 받아 둔 내용을 다시 쓴다(#405). 알림은 상대가 바꾼 것을 보라는 뜻이라 받아 둔 내용을 보여 주면 안 된다
  test("30초 안에 본 탭의 알림을 누르면 상대가 더한 항목이 보인다", async ({ page }, testInfo) => {
    // Arrange
    const content = createTestName("E2E 알림 탭", testInfo);
    await openScreen(page, TODOS_PATH, getTab(page, TODOS_PATH));
    await getTab(page, RECORDS_PATH).tap();
    await page.waitForURL(`**${RECORDS_PATH}`);
    const deleteTodo = await createDisposableTodo({ id: randomUUID(), content });
    try {
      // Act
      await sendPushOpenMessage(page, new URL(TODOS_PATH, page.url()).href);
      await page.waitForURL(`**${TODOS_PATH}`);

      // Assert
      await expect(page.locator("main").locator("visible=true").getByText(content)).toBeVisible();
    } finally {
      await deleteTodo();
    }
  });

  // 같은 주소로 한 번 더 옮기면 방문 기록이 하나 늘어, 뒤로 가기를 한 번 눌러도 그대로인 것처럼 보인다
  test("지금 보는 화면의 주소가 오면 방문 기록을 늘리지 않는다", async ({ page }) => {
    // Arrange
    await openScreen(page, SETTINGS_PATH, page.getByRole("heading", { name: "설정" }));
    const historyLength = await page.evaluate(() => history.length);

    // Act
    const reply = await sendPushOpenMessage(page, page.url());

    // Assert
    expect(reply).toEqual({ type: PUSH_OPEN_MESSAGE });
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => history.length)).toBe(historyLength);
  });

  test("다른 사이트 주소가 오면 답하지 않고 옮기지 않는다", async ({ page }) => {
    // Arrange
    await openScreen(page, "/todos/new", getTodoContent(page));

    // Act
    const reply = await sendPushOpenMessage(page, "https://evil.example/settings");

    // Assert
    expect(reply).toBeUndefined();
    expect(new URL(page.url()).pathname).toBe("/todos/new");
  });
});
