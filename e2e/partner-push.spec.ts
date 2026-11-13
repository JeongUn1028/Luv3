import { randomUUID } from "node:crypto";
import type { Page, Route } from "@playwright/test";
import { RECORDS_PATH } from "@/lib/dates/album";
import { PUSH_NOTIFY_PATH, PUSH_RECEIVED_MESSAGE } from "@/lib/push/message";
import type { PartnerPushBody } from "@/lib/push/partner-push";
import { TODOS_PATH } from "@/lib/todos/list";
import { pickDate } from "./support/date-picker";
import { getKstYesterday, getSubmitButton, getTab, pickPhoto, returnToApp, signInToHome } from "./support/actions";
import { createTestName } from "./support/names";
import {
  createDisposableEvent,
  createDisposableMember,
  createDisposableRecord,
  deleteEventsByTitle,
  deleteRecordWithFiles,
  getPushBadgeCount,
  setPushBadgeCount,
} from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 상대 활동 알림(#364): 저장에 성공한 휴대폰이 서버에 알림을 부탁하고, 앱을 열면 앱 아이콘 숫자를 지운다.
// 실제 발송은 서버의 알림 비밀 키와 알림 서비스가 필요해 단위 테스트(route.test.ts)와 pgTAP이 맡는다

/**
 * 알림 부탁을 붙잡아 본문을 모은다. 부탁이 실패해도 저장 화면에는 영향이 없어야 하므로 503(알림 설정 없음)으로 답한다
 */
const recordPushRequests = async (page: Page): Promise<PartnerPushBody[]> => {
  const bodies: PartnerPushBody[] = [];
  await page.route(`**${PUSH_NOTIFY_PATH}`, async (route: Route) => {
    bodies.push(route.request().postDataJSON() as PartnerPushBody);
    await route.fulfill({ status: 503, json: { code: "PUSH_NOT_CONFIGURED", message: "알림 설정이 아직 없어요." } });
  });
  return bodies;
};

test.describe("상대 활동 알림 부탁", () => {
  test("기록을 저장하는 사이 다른 화면으로 옮겨도, 저장이 끝나면 그 기록으로 알림을 부탁한다", async ({ page }, testInfo) => {
    // Arrange
    const pushRequests = await recordPushRequests(page);
    const title = createTestName("E2E 알림 기록", testInfo);
    await openScreen(page, "/dates/new", page.locator("#memo").locator("visible=true"));
    await pickPhoto(page, 1);
    await pickDate(page, "#date", getKstYesterday());
    await page.locator("#title").fill(title);

    let releaseSave = (): void => undefined;
    const saveReleased = new Promise<void>((resolve) => {
      releaseSave = resolve;
    });
    let recordId = "";
    await page.route("**/rest/v1/rpc/create_date_record", async (route) => {
      ({ p_id: recordId } = route.request().postDataJSON() as { p_id: string });
      await saveReleased;
      await route.continue();
    });
    await getSubmitButton(page).tap();
    await expect.poll(() => recordId).not.toBe("");

    try {
      // Act: 저장이 끝나기 전에 다른 탭으로 옮긴다(#104)
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${RECORDS_PATH}`);
      await getTab(page, TODOS_PATH).tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      releaseSave();

      // Assert
      await expect(page.getByRole("status").filter({ hasText: "기록을 저장했어요" })).toBeVisible();
      await expect.poll(() => pushRequests).toEqual([{ kind: "record", id: recordId }]);
    } finally {
      await deleteRecordWithFiles(recordId);
    }
  });

  test("댓글을 남기면 그 댓글로 알림을 부탁하고, 부탁이 실패해도 댓글은 남는다", async ({ page }, testInfo) => {
    // Arrange
    const pushRequests = await recordPushRequests(page);
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 알림 댓글 기록", testInfo) });
    let commentId = "";
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/rest/v1/comments")) ({ id: commentId } = request.postDataJSON() as { id: string });
    });

    try {
      await openScreen(page, `/dates/${recordId}`, page.locator("#comment-content").locator("visible=true"));

      // Act
      await page.locator("#comment-content").locator("visible=true").fill("알림 가는 댓글");
      await page.getByRole("button", { name: /^남기/ }).locator("visible=true").click();

      // Assert
      await expect(page.getByRole("status").filter({ hasText: "댓글을 남겼어요." })).toHaveCount(1);
      await expect.poll(() => pushRequests).toEqual([{ kind: "comment", id: commentId }]);
      await expect(page.getByRole("alert").filter({ hasText: "댓글을 남기지 못했어요" })).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("일정을 새로 추가하면 알림을 부탁하고, 일정을 고치면 부탁하지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const pushRequests = await recordPushRequests(page);
    const title = createTestName("E2E 알림 일정", testInfo);
    const editedId = randomUUID();
    const deleteEdited = await createDisposableEvent({ id: editedId, title: `${title} 고칠`, date: "2036-04-02" });
    let newEventId = "";
    page.on("request", (request) => {
      if (request.method() === "POST" && request.url().includes("/rest/v1/events")) ({ id: newEventId } = request.postDataJSON() as { id: string });
    });

    try {
      // Act: 새 일정
      await openScreen(page, "/events/new?date=2036-04-01", page.locator("#event-title"));
      await page.locator("#event-title").fill(title);
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert
      await expect.poll(() => pushRequests).toEqual([{ kind: "event", id: newEventId }]);

      // Act: 있던 일정 고치기
      await openScreen(page, `/events/${editedId}/edit`, page.locator("#event-title"));
      await page.locator("#event-title").fill(`${title} 고침`);
      await page.getByRole("button", { name: "저장" }).click();
      await page.waitForURL(/\/calendar/);

      // Assert: 고친 일정은 부탁하지 않는다
      await expect(page.getByText(`${title} 고침`).locator("visible=true")).toBeVisible();
      expect(pushRequests).toHaveLength(1);
    } finally {
      await deleteEdited();
      await deleteEventsByTitle(title);
    }
  });
});

test.describe("앱 아이콘 숫자", () => {
  // 숫자를 세는 계정을 나란히 도는 테스트와 나누려고 임시 계정을 쓴다
  test.use({ storageState: { cookies: [], origins: [] } });

  test("앱을 열거나, 앱을 보는 동안 알림이 오면 서버의 숫자를 0으로 하고 아이콘 숫자를 지운다", async ({ page }) => {
    // Arrange
    const password = randomUUID();
    const member = await createDisposableMember(password);
    await page.addInitScript(() => {
      const calls: string[] = [];
      Object.assign(window, { badgeCalls: calls });
      Object.defineProperty(navigator, "clearAppBadge", {
        configurable: true,
        value: async () => {
          calls.push("clear");
        },
      });
    });

    try {
      await setPushBadgeCount(member.id, 3);

      // Act
      await signInToHome(page, member.email, password);

      // Assert
      await expect.poll(() => getPushBadgeCount(member.id)).toBe(0);
      await expect.poll(() => page.evaluate(() => (window as unknown as { badgeCalls: string[] }).badgeCalls.length)).toBeGreaterThan(0);

      // Act: 앱을 쓰는 사이 알림이 와서 숫자가 오른 뒤, 다른 앱에 다녀온다
      await setPushBadgeCount(member.id, 2);
      await returnToApp(page);

      // Assert
      await expect.poll(() => getPushBadgeCount(member.id)).toBe(0);

      // Act: 앱을 보고 있는 동안 알림이 와서 서비스 워커가 알린다
      await setPushBadgeCount(member.id, 1);
      await page.evaluate((type) => {
        navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type } }));
      }, PUSH_RECEIVED_MESSAGE);

      // Assert
      await expect.poll(() => getPushBadgeCount(member.id)).toBe(0);
    } finally {
      await member.remove();
    }
  });
});
