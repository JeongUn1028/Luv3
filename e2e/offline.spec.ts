import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { E2E_MEMBER, E2E_TODOS, PHOTO_RECORD, TOP_BLANK_SPACE } from "./support/constants";
import { expect, getDocumentOverflow, getScrollArea, openScreen, test } from "./support/test";
import { getSaveButton, getTab, pretendOffline, signInToHome } from "./support/actions";
import { createTestName } from "./support/names";
import { createDisposableRecord, deleteTodosByContent } from "./support/seed";

const [TODO] = E2E_TODOS;

const getOfflineNotice = (page: Page): Locator => page.getByRole("status").filter({ hasText: "인터넷이 끊겼어요" });
const getRecordLink = (page: Page): Locator => page.locator(`a[href="/dates/${PHOTO_RECORD.id}"]`).locator("visible=true");
const getLogoutButton = (page: Page): Locator => page.getByRole("button", { name: "로그아웃" });
const getSessionLostDialog = (page: Page): Locator => page.getByRole("dialog", { name: "다시 로그인해 주세요" });

const getBox = async (locator: Locator): Promise<{ top: number; bottom: number; height: number }> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error("요소가 화면에 있어야 잴 수 있습니다");
  return { top: box.y, bottom: box.y + box.height, height: box.height };
};

/** 화면이 두 번 그려질 때까지 기다린다. 누름이 막히지 않았다면 그사이 상태가 바뀌고 요청이 나간다 */
const waitForFrames = (page: Page): Promise<void> =>
  page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));

const goOffline = async (page: Page): Promise<void> => {
  await page.context().setOffline(true);
  await expect(getOfflineNotice(page)).toBeVisible();
};

test.describe("인터넷이 끊기면", () => {
  test("현재 화면에 안내하고 다시 연결되면 안내를 없앤다", async ({ page, context }) => {
    await openScreen(page, "/", getTab(page, "/records"));
    await expect(getOfflineNotice(page)).toBeHidden();

    await goOffline(page);

    await context.setOffline(false);
    await expect(getOfflineNotice(page)).toBeHidden();
  });

  test("탭을 눌러도 앱 화면에 남고 다시 연결되면 그 화면의 내용이 나온다", async ({ page, context }) => {
    await openScreen(page, "/", getTab(page, "/records"));
    await goOffline(page);

    await getTab(page, "/records").tap();

    await page.waitForURL("**/records");
    await expect(page.getByRole("heading", { name: "기록" })).toBeVisible();
    await expect(getOfflineNotice(page)).toBeVisible();
    await expect(getTab(page, "/")).toBeVisible();

    await context.setOffline(false);
    await expect(getRecordLink(page)).toBeVisible();
    await expect(getOfflineNotice(page)).toBeHidden();
  });

  test("미리 받지 못한 화면을 눌러도 앱 화면에 남고 다시 연결되면 그 화면으로 간다", async ({ page, context }) => {
    // 끊김으로 잘못 알지 않게 요청을 끊지 않고 서버 오류로 답해, 미리 받기만 실패한 상태를 만든다
    await page.route("**/records**", (route) =>
      route.request().headers()["next-router-prefetch"] ? route.fulfill({ status: 500, body: "" }) : route.fallback(),
    );
    await openScreen(page, "/", getTab(page, "/records"));
    await goOffline(page);

    await getTab(page, "/records").tap();

    await expect(getOfflineNotice(page)).toBeVisible();
    await expect(page.locator("nav").locator("visible=true")).toBeVisible();

    await context.setOffline(false);
    await page.waitForURL("**/records");
    await expect(getRecordLink(page)).toBeVisible();
    await expect(getOfflineNotice(page)).toBeHidden();
  });

  test("화면 코드를 아직 받지 못한 화면을 눌러도 다시 연결되면 오류 화면 없이 그 화면이 나온다", async ({ page, context }) => {
    // 설정만 열어 홈의 화면 코드를 아직 받지 않았다. 지하철에서 막 들어온 경우와 같다
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));
    await goOffline(page);

    await page.getByRole("link", { name: "뒤로" }).tap();

    await expect(getOfflineNotice(page)).toBeVisible();
    await expect(page.locator("main").locator("visible=true")).toBeVisible();

    await context.setOffline(false);
    await expect(getTab(page, "/records")).toBeVisible();
    await expect(page.getByText(TODO.content).locator("visible=true").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "문제가 생겼어요" })).toHaveCount(0);
    await expect(getOfflineNotice(page)).toBeHidden();
  });

  test("요청만 끊긴 경우(공유기는 잡혔는데 인터넷이 없음)에도 앱 화면에 남고 복구되면 이어 간다", async ({ page }) => {
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));
    await page.route("**/*", (route) => route.abort("internetdisconnected"));

    await page.getByRole("link", { name: "뒤로" }).tap();

    await expect(getOfflineNotice(page)).toBeVisible();
    await expect(page.locator("main").locator("visible=true")).toBeVisible();

    await page.unroute("**/*");
    await expect(page.getByText(TODO.content).locator("visible=true").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "문제가 생겼어요" })).toHaveCount(0);
    await expect(getOfflineNotice(page)).toBeHidden();
  });

  test("저장 버튼이 끊김을 알아채기 전에 보낸 요청이 끊기면 다시 로그인 창 없이 저장 확인 문구를 보이고 쓴 내용이 남는다", async ({ page }) => {
    // 끊긴 채로 연 화면처럼 브라우저는 끊긴 줄 알지만(navigator.onLine) 앱의 끊김 표시(useOffline)는 아직 바뀌지 않은 경우다.
    // 폼에 남아(#345) 서버에 닿았는지 알 수 없으니 다시 저장해도 둘이 되지 않는다고 알린다(#161)
    const content = `E2E 요청만 끊긴 항목 ${randomUUID().slice(0, 6)}`;
    await openScreen(page, "/todos/new", getSaveButton(page));
    const textbox = page.locator("main").getByRole("textbox").locator("visible=true");
    await textbox.fill(content);
    await page.route("**/rest/v1/todos*", (route: Route) => route.abort("internetdisconnected"));
    await pretendOffline(page);

    await getSaveButton(page).click();

    await expect(page.locator("main").getByRole("alert").locator("visible=true")).toContainText("저장됐는지 확인하지 못했어요");
    expect(new URL(page.url()).pathname).toBe("/todos/new");
    await expect(getSessionLostDialog(page)).toBeHidden();
    await expect(textbox).toHaveValue(content);
  });

  test("끊긴 채로는 저장 버튼을 막아 보내지 않고, 쓴 내용을 둔 채 다시 연결되면 저장한다", async ({ page, context }) => {
    const content = `E2E 끊긴 동안 쓴 항목 ${randomUUID().slice(0, 6)}`;
    await openScreen(page, "/todos/new", getSaveButton(page));
    const textbox = page.locator("main").getByRole("textbox").locator("visible=true");
    await textbox.fill(content);
    let requestCount = 0;
    await page.route("**/rest/v1/todos*", (route: Route) => {
      requestCount += 1;
      return route.fallback();
    });
    await goOffline(page);

    // 보내 보고 "저장됐는지 확인하지 못했어요"라고 하면, 끊긴 것을 알면서도 저장됐을 수 있다고 말하게 된다(#349)
    await expect(getSaveButton(page)).toHaveAttribute("aria-disabled", "true");
    await expect(getSaveButton(page)).toHaveAccessibleDescription("연결되면 저장할 수 있어요");
    await textbox.press("Enter");
    await getSaveButton(page).dispatchEvent("click");

    expect(requestCount).toBe(0);
    await expect(page.locator("main").getByRole("alert").locator("visible=true")).toHaveCount(0);
    expect(new URL(page.url()).pathname).toBe("/todos/new");
    await expect(getSessionLostDialog(page)).toBeHidden();
    await expect(textbox).toHaveValue(content);
    const notice = await getBox(getOfflineNotice(page));
    expect(notice.bottom).toBeLessThanOrEqual((await getBox(page.locator("main header").locator("visible=true"))).top);

    await context.setOffline(false);
    await expect(getSaveButton(page)).not.toHaveAttribute("aria-disabled", "true");
    await getSaveButton(page).click();

    try {
      await page.waitForURL("**/todos");
      await expect(page.getByText(content).locator("visible=true")).toBeVisible();
      expect(requestCount).toBeGreaterThan(0);
    } finally {
      await deleteTodosByContent(content);
    }
  });

  test("저장 중에 떠난 화면의 위쪽 알림은 안내 아래에 놓인다", async ({ page }) => {
    await openScreen(page, "/todos/new", getSaveButton(page));
    await page.getByRole("textbox").fill("E2E 끊긴 동안 떠난 항목");
    let finishSave: () => void = () => undefined;
    const saveFinished = new Promise<void>((resolve) => {
      finishSave = resolve;
    });
    let markRequested: () => void = () => undefined;
    const saveRequested = new Promise<void>((resolve) => {
      markRequested = resolve;
    });
    await page.route("**/rest/v1/todos*", async (route: Route) => {
      markRequested();
      await saveFinished;
      await route.abort();
    });
    await getSaveButton(page).click();
    await saveRequested;
    await goOffline(page);

    // 저장을 기다리지 않고 바로 목록으로 돌아간다(#345)
    await page.waitForURL("**/todos");
    finishSave();

    const saveNotice = page.getByRole("alert").filter({ hasText: "저장하지 못했어요" }).filter({ has: page.getByRole("button", { name: "닫기" }) });
    await expect(saveNotice).toBeVisible();
    expect((await getBox(getOfflineNotice(page))).bottom).toBeLessThanOrEqual((await getBox(saveNotice)).top);
  });

  test("안내는 맨 위 빈 자리 아래에 글자를 두고 머리글을 가리지 않으며 문서를 늘리지 않는다", async ({ page, safeArea }) => {
    await openScreen(page, "/todos", page.getByText(TODO.content));
    const headerBefore = await getBox(page.locator("main header"));

    await goOffline(page);

    const notice = await getBox(getOfflineNotice(page));
    const header = await getBox(page.locator("main header"));
    expect(notice.top).toBe(0);
    expect((await getBox(getOfflineNotice(page).locator("p"))).top).toBe(safeArea.top + TOP_BLANK_SPACE);
    // 머리글은 안내 바로 아래에 붙는다. 맨 위 여백이 두 번 붙으면 이만큼 더 내려간다
    expect(header.top).toBe(notice.bottom);
    expect(header.height).toBe(headerBefore.height);
    await expect(getScrollArea(page)).toBeVisible();
    expect(await getDocumentOverflow(page)).toBe(0);
  });

  test("로그아웃을 눌러도 앱 화면에 남아 알리고 다시 연결되면 다시 누를 수 있다", async ({ page, context }) => {
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));
    await goOffline(page);

    await getLogoutButton(page).click();

    await expect(page.getByRole("alert").filter({ hasText: "로그아웃하지 못했어요" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "설정" })).toBeVisible();
    await expect(getLogoutButton(page)).toBeEnabled();

    await context.setOffline(false);
    await expect(getOfflineNotice(page)).toBeHidden();
    expect(new URL(page.url()).pathname).toBe("/settings");
  });
});

test.describe("끊긴 채로 보내는 버튼", () => {
  test("비밀번호 바꾸기는 막아 보내지 않고, 다시 연결되면 누를 수 있다", async ({ page, context }) => {
    await openScreen(page, "/settings/password", page.getByLabel("현재 비밀번호"));
    await page.getByLabel("현재 비밀번호").fill("current-password-1");
    await page.getByLabel("새 비밀번호", { exact: true }).fill("new-password-1234");
    await page.getByLabel("새 비밀번호 확인").fill("new-password-1234");
    let requestCount = 0;
    await page.route("**/auth/v1/**", (route: Route) => {
      requestCount += 1;
      return route.fallback();
    });
    const button = page.getByRole("button", { name: "비밀번호 바꾸기" });
    await goOffline(page);

    // 보내 보면 끊긴 것을 알면서도 "바꾸지 못했어요"라고 하게 된다(#388)
    await expect(button).toHaveAttribute("aria-disabled", "true");
    await expect(button).toHaveAccessibleDescription("연결되면 바꿀 수 있어요");
    await page.getByLabel("새 비밀번호 확인").press("Enter");
    await button.dispatchEvent("click");
    // 막지 못했으면 이 사이에 보내고 실패를 알린다. 그린 뒤까지 기다려야 "보내지 않았다"를 확인할 수 있다
    await expect(button).toHaveText("비밀번호 바꾸기");
    await waitForFrames(page);

    expect(requestCount).toBe(0);
    await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    await expect(page.getByLabel("현재 비밀번호")).toHaveValue("current-password-1");

    await context.setOffline(false);
    await expect(button).not.toHaveAttribute("aria-disabled", "true");
  });

  test("댓글 남기기는 막아 보내지 않고 쓴 글을 둔다", async ({ page, context }, testInfo) => {
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 끊긴 댓글 기록", testInfo) });
    try {
      const input = page.locator("#comment-content").locator("visible=true");
      await openScreen(page, `/dates/${recordId}`, input);
      await input.fill("끊긴 동안 쓴 댓글");
      let requestCount = 0;
      await page.route("**/rest/v1/comments*", (route: Route) => {
        requestCount += 1;
        return route.fallback();
      });
      const button = page.getByRole("button", { name: "남기기" }).locator("visible=true");
      await goOffline(page);

      // 보내 보면 먼저 붙인 댓글을 빼고 "남기지 못했어요"라고 하게 된다(#388)
      await expect(button).toHaveAttribute("aria-disabled", "true");
      await expect(button).toHaveAccessibleDescription("연결되면 남길 수 있어요");
      await button.dispatchEvent("click");
      // 막지 못했으면 먼저 붙인 댓글을 그리고 보낸다. 그린 뒤까지 기다려야 "보내지 않았다"를 확인할 수 있다
      await waitForFrames(page);

      expect(requestCount).toBe(0);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      await expect(page.getByRole("list", { name: "댓글 목록" }).locator("visible=true")).toBeHidden();
      await expect(input).toHaveValue("끊긴 동안 쓴 댓글");

      await context.setOffline(false);
      await expect(button).not.toHaveAttribute("aria-disabled", "true");
    } finally {
      await deleteRecord();
    }
  });
});

test.describe("로그아웃", () => {
  // 함께 쓰는 로그인 상태를 끊지 않도록 따로 로그인한 세션으로 잰다
  test.use({ storageState: { cookies: [], origins: [] } });

  test("인터넷이 연결돼 있으면 로그아웃하고 로그인 화면으로 간다", async ({ page, context }) => {
    const password = process.env.E2E_MEMBER_PASSWORD;
    if (!password) throw new Error("E2E_MEMBER_PASSWORD가 없습니다. global-setup이 돌았는지 확인해 주세요.");
    await signInToHome(page, E2E_MEMBER.email, password);
    await openScreen(page, "/settings", page.getByText(E2E_MEMBER.nickname, { exact: true }));

    await getLogoutButton(page).click();

    await page.waitForURL("**/login");
    const cookies = await context.cookies();
    expect(cookies.filter(({ name }) => name.includes("auth-token"))).toEqual([]);
  });
});
