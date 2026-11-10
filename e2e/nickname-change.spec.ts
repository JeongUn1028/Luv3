import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { SETTINGS_NICKNAME_PATH, SETTINGS_PATH } from "@/lib/auth/paths";
import { CALENDAR_PATH } from "@/lib/calendar/month";
import { createDisposableMember, createMemberContent } from "./support/seed";
import { expect, getScrollAreaOverflow, openScreen, test } from "./support/test";
import { getSaveButton, getTab, signInToHome } from "./support/actions";
import { createTestName } from "./support/names";

const MEMBERS_URL = "**/rest/v1/members*";
const LONG_NICKNAME = "가나다라마바사아자차카타파하가나다라마바";
/** 한글에서 가장 넓은 편인 글자 6자. 이 폭까지 이름표가 줄지 않아야 한다 */
const WIDE_NICKNAME = "뷁뷁뷁뷁뷁뷁";

// 전용 계정의 닉네임을 바꾸면 나란히 도는 다른 테스트가 흔들리므로 테스트마다 임시 계정을 쓴다
test.use({ storageState: { cookies: [], origins: [] } });

const getNicknameRow = (page: Page): Locator => page.getByRole("link", { name: /^닉네임/ }).locator("visible=true");
const getNicknameInput = (page: Page): Locator => page.getByLabel("닉네임", { exact: true }).locator("visible=true");

const openNicknameScreen = (page: Page): Promise<void> => openScreen(page, SETTINGS_NICKNAME_PATH, page.getByLabel("닉네임", { exact: true }));

const isTruncated = (locator: Locator): Promise<boolean> => locator.evaluate((element) => element.scrollWidth > element.clientWidth);

test.describe("닉네임 변경", () => {
  let memberId: string;
  let email: string;
  let password: string;
  let removeMember: (() => Promise<void>) | undefined;

  const useMember = async (nickname?: string): Promise<void> => {
    password = randomUUID();
    ({ id: memberId, email, remove: removeMember } = await createDisposableMember(password, nickname));
  };

  test.afterEach(async () => {
    // 계정을 만들다 실패해도 그 오류가 가려지지 않게 하고, 지난 테스트의 계정을 또 지우지 않는다
    await removeMember?.();
    removeMember = undefined;
  });

  test("설정에서 들어가 바꾸면 설정으로 돌아오고 지난 기록과 일정, 숨겨 둔 화면까지 새 닉네임으로 보인다", async ({ page }, testInfo) => {
    // Arrange: 캘린더 탭을 먼저 봐서 예전 닉네임이 그려진 화면이 숨겨져 남게 한다
    await useMember("예전이름");
    const label = createTestName("E2E 닉네임", testInfo);
    const { recordId, eventId } = await createMemberContent({ memberId, label });
    await signInToHome(page, email, password);
    await getTab(page, CALENDAR_PATH).click();
    const eventRow = page.getByRole("link", { name: new RegExp(`${label} 일정`) }).locator("visible=true");
    await expect(eventRow.getByTitle("예전이름")).toBeVisible();

    // Act
    await getTab(page, "/").click();
    await page.getByRole("link", { name: "설정" }).click();
    await getNicknameRow(page).click();
    await expect(getNicknameInput(page)).toHaveValue("예전이름");
    await getNicknameInput(page).fill("새이름");
    await getSaveButton(page).click();

    // Assert: 저장 결과가 설정 줄에 바로 보인다
    await page.waitForURL(`**${SETTINGS_PATH}`);
    await expect(getNicknameRow(page)).toContainText("새이름");
    await page.getByRole("link", { name: "뒤로" }).click();
    await getTab(page, CALENDAR_PATH).click();
    await expect(eventRow.getByRole("img", { name: "새이름 일정" })).toBeVisible();
    await expect(eventRow.getByTitle("예전이름")).toBeHidden();

    // 숨겨 둔 화면이 아닌 새로 그린 캘린더도 새 닉네임이다
    await openScreen(page, CALENDAR_PATH, page.getByText(`${label} 일정`));
    await expect(page.getByRole("link", { name: new RegExp(`${label} 일정.*새이름 일정`) })).toBeVisible();

    await openScreen(page, `/dates/${recordId}`, page.getByRole("heading", { name: `${label} 기록` }));
    expect(await page.locator("article").ariaSnapshot()).toContain("작성자 새이름");

    await openScreen(page, `/events/${eventId}/edit`, page.getByRole("heading", { name: "일정 고치기" }));
    expect(await page.locator("header").ariaSnapshot()).toContain("작성자 새이름");
    await expect(page.getByRole("radio", { name: "새이름" })).toBeAttached();

    await page.reload();
    await openScreen(page, SETTINGS_PATH, getNicknameRow(page));
    await expect(getNicknameRow(page)).toContainText("새이름");
  });

  test("비었거나 공백만 있거나 6자를 넘으면 서버에 보내지 않고 안내한다", async ({ page }) => {
    // Arrange
    await useMember();
    await signInToHome(page, email, password);
    await openNicknameScreen(page);
    const updates: string[] = [];
    page.on("request", (request) => {
      if (request.method() === "PATCH" && request.url().includes("/rest/v1/members")) updates.push(request.url());
    });

    // Act & Assert
    await getNicknameInput(page).fill("");
    await getSaveButton(page).click();
    await expect(page.getByText("닉네임을 적어 주세요.")).toBeVisible();
    await expect(getNicknameInput(page)).toHaveAttribute("aria-invalid", "true");

    await getNicknameInput(page).fill("   ");
    await expect(page.getByText("닉네임을 적어 주세요.")).toBeHidden();
    await getSaveButton(page).click();
    await expect(page.getByText("닉네임을 적어 주세요.")).toBeVisible();

    await getNicknameInput(page).fill("가나다라마바사");
    await expect(page.getByText("7/6")).toBeVisible();
    await getSaveButton(page).click();
    await expect(page.getByText("닉네임은 6자까지 적을 수 있어요.")).toBeVisible();

    expect(updates).toEqual([]);
    expect(new URL(page.url()).pathname).toBe(SETTINGS_NICKNAME_PATH);
  });

  test("일정 구분에 쓰는 함께는 닉네임으로 저장하지 않는다", async ({ page }) => {
    // Arrange
    await useMember();
    await signInToHome(page, email, password);
    await openNicknameScreen(page);

    // Act
    await getNicknameInput(page).fill("함께");
    await getSaveButton(page).click();

    // Assert
    await expect(page.getByText("닉네임으로 쓸 수 없어요")).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(SETTINGS_NICKNAME_PATH);
  });

  test("앞뒤 공백은 지우고 저장한다", async ({ page }) => {
    // Arrange
    await useMember();
    await signInToHome(page, email, password);
    await openNicknameScreen(page);

    // Act
    await getNicknameInput(page).fill("  공백 뺀이름  ");
    await expect(page.getByText("6/6")).toBeVisible();
    await getSaveButton(page).click();

    // Assert
    await page.waitForURL(`**${SETTINGS_PATH}`);
    await expect(getNicknameRow(page).getByText("공백 뺀이름", { exact: true })).toBeVisible();
    await page.reload();
    await expect(getNicknameRow(page).getByText("공백 뺀이름", { exact: true })).toBeVisible();
  });

  test("저장에 실패하면 적은 값을 남기고 알리며, 다시 저장할 수 있다", async ({ page }) => {
    // Arrange
    await useMember();
    await signInToHome(page, email, password);
    await openNicknameScreen(page);
    await page.route(MEMBERS_URL, (route) =>
      route.request().method() === "PATCH" ? route.fulfill({ status: 500, json: { message: "E2E 저장 실패" } }) : route.continue(),
    );

    // Act
    await getNicknameInput(page).fill("새이름");
    await getSaveButton(page).click();

    // Assert
    const alert = page.locator("main").getByRole("alert");
    await expect(alert).toContainText("저장하지 못했어요");
    await expect(getNicknameInput(page)).toHaveValue("새이름");
    await expect(getSaveButton(page)).toBeEnabled();

    // 다시 적기 시작하면 지난 안내를 지운다
    await getNicknameInput(page).fill("새이름2");
    await expect(alert).toBeHidden();

    await page.unroute(MEMBERS_URL);
    await getSaveButton(page).click();
    await page.waitForURL(`**${SETTINGS_PATH}`);
    await expect(getNicknameRow(page)).toContainText("새이름2");
  });

  test("권한이 없어 바뀐 행이 없으면 저장된 것처럼 넘어가지 않는다", async ({ page }) => {
    // Arrange
    await useMember();
    await signInToHome(page, email, password);
    await openNicknameScreen(page);
    await page.route(MEMBERS_URL, (route) => (route.request().method() === "PATCH" ? route.fulfill({ status: 200, json: [] }) : route.continue()));

    // Act
    await getNicknameInput(page).fill("새이름");
    await getSaveButton(page).click();

    // Assert
    await expect(page.locator("main").getByRole("alert")).toContainText("저장하지 못했어요");
    expect(new URL(page.url()).pathname).toBe(SETTINGS_NICKNAME_PATH);
  });

  test("저장하는 사이 다른 화면으로 옮겨도 끌고 오지 않고 결과를 알린다", async ({ page }) => {
    // Arrange
    await useMember();
    await signInToHome(page, email, password);
    await openScreen(page, SETTINGS_PATH, getNicknameRow(page));
    await getNicknameRow(page).click();
    await getNicknameInput(page).waitFor();
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(MEMBERS_URL, async (route) => {
      if (route.request().method() === "PATCH") await released;
      await route.continue();
    });

    // Act
    await getNicknameInput(page).fill("새이름");
    await getSaveButton(page).click();
    await page.getByRole("link", { name: "뒤로" }).click();
    await page.waitForURL(`**${SETTINGS_PATH}`);
    release();

    // Assert
    await expect(page.getByRole("status").filter({ hasText: "닉네임을 저장했어요" })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe(SETTINGS_PATH);
    await expect(getNicknameRow(page)).toContainText("새이름");
  });

  test("6자를 넘는 예전 닉네임도 설정과 폼이 깨지지 않고, 줄여서 저장할 수 있다", async ({ page }, testInfo) => {
    // Arrange
    await useMember(LONG_NICKNAME);
    const label = createTestName("E2E 긴 닉네임", testInfo);
    const { eventId } = await createMemberContent({ memberId, label });
    await signInToHome(page, email, password);

    // Act: 설정 줄은 넘치지 않게 줄여 그리고, 링크 이름은 전체를 읽는다
    await openScreen(page, SETTINGS_PATH, getNicknameRow(page));

    // Assert
    await expect(getNicknameRow(page)).toHaveAccessibleName(`닉네임 ${LONG_NICKNAME}`);
    expect(await isTruncated(getNicknameRow(page).getByText(LONG_NICKNAME))).toBe(true);
    expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);

    // 일정 폼의 선택 버튼도 넘치지 않는다
    await openScreen(page, `/events/${eventId}/edit`, page.getByRole("heading", { name: "일정 고치기" }));
    expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);

    // 폼은 잘라 내지 않고 보여 주고, 저장하려면 줄이라고 안내한다
    await openNicknameScreen(page);
    await expect(getNicknameInput(page)).toHaveValue(LONG_NICKNAME);
    await expect(page.getByText("20/6")).toBeVisible();
    await getSaveButton(page).click();
    await expect(page.getByText("닉네임은 6자까지 적을 수 있어요.")).toBeVisible();

    await getNicknameInput(page).fill("줄인이름");
    await getSaveButton(page).click();
    await page.waitForURL(`**${SETTINGS_PATH}`);
    await expect(getNicknameRow(page)).toContainText("줄인이름");
  });

  test("넓은 글자 6자는 일정 폼 버튼과 캘린더 이름표에서 줄지 않고, 설정 줄도 넘치지 않는다", async ({ page }, testInfo) => {
    // Arrange
    await useMember(WIDE_NICKNAME);
    const label = createTestName("E2E 넓은 닉네임", testInfo);
    const { eventId } = await createMemberContent({ memberId, label });
    await signInToHome(page, email, password);

    // Act & Assert: 일정 폼의 "누구 일정" 버튼
    await openScreen(page, `/events/${eventId}/edit`, page.getByRole("heading", { name: "일정 고치기" }));
    const ownerButton = page.locator("fieldset label").filter({ hasText: WIDE_NICKNAME }).locator("span.truncate");
    expect(await isTruncated(ownerButton)).toBe(false);

    // 캘린더 일정 줄의 이름표
    await openScreen(page, "/calendar", page.getByText(`${label} 일정`));
    const eventRow = page.getByRole("link", { name: new RegExp(`${label} 일정`) });
    expect(await isTruncated(eventRow.getByTitle(WIDE_NICKNAME))).toBe(false);
    expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);

    // 설정 줄
    await openScreen(page, SETTINGS_PATH, getNicknameRow(page));
    expect(await isTruncated(getNicknameRow(page).getByText(WIDE_NICKNAME))).toBe(false);
  });
});
