import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { E2E_MEMBER } from "./support/constants";
import { signInToHome } from "./support/actions";
import { createComment, createDisposableMember, createDisposableRecord, deleteRecordWithFiles } from "./support/seed";
import { expect, getScrollArea, getScrollAreaOverflow, openScreen, test } from "./support/test";
import { createTestName } from "./support/names";

// 기록 댓글(#18): 두 사람이 서로의 기록에 댓글을 남기고, 지우는 것은 쓴 사람만 한다

const getHeading = (page: Page): Locator => page.locator("#record-comments").locator("visible=true");
const getCommentList = (page: Page): Locator => page.getByRole("list", { name: "댓글 목록" }).locator("visible=true");
const getComments = (page: Page): Locator => getCommentList(page).getByRole("listitem");
const getComment = (page: Page, content: string): Locator => getComments(page).filter({ hasText: content });
const getCommentInput = (page: Page): Locator => page.locator("#comment-content").locator("visible=true");
const getSendButton = (page: Page): Locator => page.getByRole("button", { name: /^남기/ }).locator("visible=true");

const openRecord = (page: Page, recordId: string): Promise<void> => openScreen(page, `/dates/${recordId}`, getHeading(page));

const getPartnerNickname = (): string => `상대${randomUUID().slice(0, 4)}`;

const COMMENTS_ROUTE = "**/rest/v1/comments*";

/**
 * 댓글을 남기거나 지우는 요청을 붙잡아 두고, 돌려받은 함수를 부르면 그때 보내거나 끊는다.
 * 저장이 끝나기 전 화면을 보려고 쓴다.
 */
const holdCommentRequest = async (page: Page, method: "POST" | "DELETE", outcome: "continue" | "abort"): Promise<() => void> => {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(COMMENTS_ROUTE, async (route: Route) => {
    if (route.request().method() !== method) return route.continue();
    await released;
    return outcome === "abort" ? route.abort() : route.continue();
  });
  return release;
};

test.describe("기록 댓글", () => {
  test("댓글을 남기면 목록 끝에 붙고, 상대 댓글은 지울 수 없고 내 댓글만 지운다", async ({ page }, testInfo) => {
    // Arrange
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 기록", testInfo) });
    const partnerNickname = getPartnerNickname();
    const partner = await createDisposableMember(randomUUID(), partnerNickname);

    try {
      await createComment({ recordId, content: "상대가 단 댓글", authorId: partner.id });
      await openRecord(page, recordId);
      const partnerComment = getComment(page, "상대가 단 댓글");
      await expect(partnerComment.getByRole("img", { name: `작성자 ${partnerNickname}` })).toBeVisible();
      await expect(partnerComment.getByRole("button", { name: "댓글 삭제" })).toHaveCount(0);

      // Act: 앞뒤 공백은 빼고, 줄바꿈은 그대로 남긴다
      await getCommentInput(page).fill("  내가 단 댓글\n두 번째 줄  ");
      await getSendButton(page).click();

      // Assert
      await expect(getComments(page)).toHaveCount(2);
      const myComment = getComments(page).last();
      await expect(myComment.locator("p").last()).toHaveText("내가 단 댓글\n두 번째 줄");
      await expect(myComment.getByRole("img", { name: `작성자 ${E2E_MEMBER.nickname}` })).toBeVisible();
      await expect(getHeading(page)).toHaveText("댓글2");
      await expect(getCommentInput(page)).toHaveValue("");
      await expect(page.getByRole("status").filter({ hasText: "댓글을 남겼어요." })).toHaveCount(1);

      // Act: 내 댓글 지우기
      await myComment.getByRole("button", { name: "댓글 삭제" }).click();
      await page.getByRole("dialog", { name: "이 댓글을 지울까요?" }).getByRole("button", { name: "삭제", exact: true }).click();

      // Assert: 버튼과 함께 사라진 초점은 댓글 제목으로 옮긴다
      await expect(getComments(page)).toHaveCount(1);
      await expect(getComment(page, "상대가 단 댓글")).toHaveCount(1);
      await expect(getHeading(page)).toBeFocused();
    } finally {
      await deleteRecord();
      await partner.remove();
    }
  });

  test("200자를 넘기면 남기지 않고, 띄어쓰기 없는 200자 댓글도 화면 폭을 넘지 않는다", async ({ page }, testInfo) => {
    // Arrange
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 긴 댓글 기록", testInfo) });
    const longWord = "a".repeat(200);

    try {
      await createComment({ recordId, content: longWord });
      await openRecord(page, recordId);

      // Assert: 긴 낱말도 줄을 바꿔 가로로 넘치지 않는다
      const viewportWidth = page.viewportSize()?.width ?? 0;
      const box = await getComment(page, longWord).boundingBox();
      expect(box).not.toBeNull();
      expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(viewportWidth);
      expect((await getScrollAreaOverflow(page)).horizontal).toBe(0);

      // Act
      await getCommentInput(page).fill("가".repeat(201));
      await expect(page.locator("#comment-count").locator("visible=true")).toHaveText("201/200");
      await getSendButton(page).click();

      // Assert
      await expect(page.locator("#comment-error").locator("visible=true")).toHaveText("200자까지 적을 수 있어요.");
      await expect(getCommentInput(page)).toHaveAttribute("aria-invalid", "true");
      await expect(getComments(page)).toHaveCount(1);
    } finally {
      await deleteRecord();
    }
  });

  test("남기기를 누르면 저장을 기다리지 않고 목록 끝에 붙고, 저장이 끝나면 시각과 삭제가 붙는다", async ({ page }, testInfo) => {
    // Arrange
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 바로 반영 기록", testInfo) });

    try {
      await openRecord(page, recordId);
      const release = await holdCommentRequest(page, "POST", "continue");

      // Act
      await getCommentInput(page).fill("바로 붙는 댓글");
      await getSendButton(page).click();

      // Assert: 저장 요청이 붙잡혀 있는 동안에도 목록에 먼저 붙고 칸은 비워진다
      const comment = getComment(page, "바로 붙는 댓글");
      await expect(comment.getByText("남기는 중…")).toBeVisible();
      await expect(comment.getByRole("img", { name: `작성자 ${E2E_MEMBER.nickname}` })).toBeVisible();
      await expect(comment.getByRole("button", { name: "댓글 삭제" })).toHaveCount(0);
      await expect(getHeading(page)).toHaveText("댓글1");
      await expect(getCommentInput(page)).toHaveValue("");
      await expect(getSendButton(page)).toBeDisabled();

      // Act
      release();

      // Assert: 저장이 끝나면 시각과 삭제가 나타나고, 다시 받은 목록에서도 한 줄이다
      await expect(comment.locator("time")).toBeVisible();
      await expect(comment.getByText("남기는 중…")).toHaveCount(0);
      await expect(comment.getByRole("button", { name: "댓글 삭제" })).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: "댓글을 남겼어요." })).toHaveCount(1);
      await expect(getSendButton(page)).toBeEnabled();
      await page.waitForLoadState("networkidle");
      await expect(getComments(page)).toHaveCount(1);
    } finally {
      await deleteRecord();
    }
  });

  test("남기지 못하면 먼저 붙인 댓글을 빼고 쓴 글을 칸에 돌려놓아 다시 남기게 한다", async ({ page }, testInfo) => {
    // Arrange
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 실패 기록", testInfo) });

    try {
      await openRecord(page, recordId);
      const release = await holdCommentRequest(page, "POST", "abort");

      // Act
      await getCommentInput(page).fill("못 남긴 댓글");
      await getSendButton(page).click();
      await expect(getComment(page, "못 남긴 댓글")).toHaveCount(1);
      release();

      // Assert
      await expect(page.getByRole("alert").filter({ hasText: "댓글을 남기지 못했어요." })).toBeVisible();
      await expect(getComments(page)).toHaveCount(0);
      await expect(getHeading(page)).toHaveText("댓글");
      await expect(getCommentInput(page)).toHaveValue("못 남긴 댓글");
      await expect(getSendButton(page)).toBeEnabled();

      // Act: 연결이 돌아온 뒤 다시 남긴다
      await page.unroute(COMMENTS_ROUTE);
      await getSendButton(page).click();

      // Assert
      await expect(getComment(page, "못 남긴 댓글").locator("time")).toBeVisible();
      await expect(page.getByRole("alert").filter({ hasText: "댓글을 남기지 못했어요." })).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("다른 댓글을 지운 뒤 화면을 다시 받는 중에 남기지 못해도 바로 칸에 돌려놓고 다시 남기게 한다", async ({ page }, testInfo) => {
    // Arrange: 지우기는 성공하고, 그 뒤 화면을 다시 받는 요청이 오래 걸린다
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 겹친 실패 기록", testInfo) });
    let heldRefreshCount = 0;
    let releaseRefresh = () => {};
    const refreshReleased = new Promise<void>((resolve) => {
      releaseRefresh = resolve;
    });

    try {
      await createComment({ recordId, content: "먼저 지울 댓글" });
      await openRecord(page, recordId);
      await page.route(`**/dates/${recordId}*`, async (route) => {
        const headers = route.request().headers();
        if (headers["rsc"] === "1" && headers["next-router-prefetch"] === undefined) {
          heldRefreshCount += 1;
          await refreshReleased;
        }
        return route.continue();
      });
      await getComment(page, "먼저 지울 댓글").getByRole("button", { name: "댓글 삭제" }).click();
      await page.getByRole("dialog", { name: "이 댓글을 지울까요?" }).getByRole("button", { name: "삭제", exact: true }).click();
      await expect(getComments(page)).toHaveCount(0);
      await expect.poll(() => heldRefreshCount).toBeGreaterThan(0);
      await page.route(COMMENTS_ROUTE, (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));

      // Act: 다시 받기가 끝나기 전에 남기다가 실패한다
      await getCommentInput(page).fill("겹쳐서 못 남긴 댓글");
      await getSendButton(page).click();

      // Assert: 다시 받기가 끝나기를 기다리지 않고 댓글이 빠지고 칸이 풀린다
      await expect(page.getByRole("alert").filter({ hasText: "댓글을 남기지 못했어요." })).toBeVisible();
      await expect(getComment(page, "겹쳐서 못 남긴 댓글")).toHaveCount(0);
      await expect(getCommentInput(page)).toHaveValue("겹쳐서 못 남긴 댓글");
      await expect(getCommentInput(page)).not.toHaveAttribute("readonly");
      await expect(getSendButton(page)).toBeEnabled();
    } finally {
      releaseRefresh();
      await deleteRecord();
    }
  });

  test("저장은 됐는데 응답만 끊겨 다시 남겨도 댓글은 하나만 생긴다", async ({ page }, testInfo) => {
    // Arrange: 첫 저장 요청은 서버에 닿아 저장되지만 브라우저는 응답을 받지 못한다
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 응답 끊김 기록", testInfo) });

    try {
      await openRecord(page, recordId);
      let isFirstPost = true;
      await page.route(COMMENTS_ROUTE, async (route) => {
        if (route.request().method() !== "POST" || !isFirstPost) return route.continue();
        isFirstPost = false;
        await route.fetch();
        return route.abort();
      });

      // Act
      await getCommentInput(page).fill("한 번만 남을 댓글");
      await getSendButton(page).click();
      await expect(page.getByRole("alert").filter({ hasText: "댓글을 남기지 못했어요." })).toBeVisible();
      await getSendButton(page).click();

      // Assert: 다시 남기기는 성공으로 끝나고, 새로 열어도 한 줄이다
      await expect(getComment(page, "한 번만 남을 댓글").locator("time")).toBeVisible();
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
      await openRecord(page, recordId);
      await expect(getComment(page, "한 번만 남을 댓글")).toHaveCount(1);
    } finally {
      await deleteRecord();
    }
  });

  test("지우기를 누르면 저장을 기다리지 않고 확인 창이 닫히며 목록에서 빠진다", async ({ page }, testInfo) => {
    // Arrange
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 바로 지우기 기록", testInfo) });

    try {
      await createComment({ recordId, content: "바로 빠지는 댓글" });
      await openRecord(page, recordId);
      const release = await holdCommentRequest(page, "DELETE", "continue");

      // Act
      await getComment(page, "바로 빠지는 댓글").getByRole("button", { name: "댓글 삭제" }).click();
      const dialog = page.getByRole("dialog", { name: "이 댓글을 지울까요?" });
      await dialog.getByRole("button", { name: "삭제", exact: true }).click();

      // Assert: 지우는 요청이 붙잡혀 있는 동안에도 창이 닫히고 목록에서 빠진다
      await expect(dialog).toBeHidden();
      await expect(getComments(page)).toHaveCount(0);
      await expect(getHeading(page)).toBeFocused();

      // Act
      release();

      // Assert: 다시 받은 목록에서도 빠져 있다
      await page.waitForLoadState("networkidle");
      await expect(getComments(page)).toHaveCount(0);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("지우지 못하면 댓글이 다시 나타나고 댓글 제목 아래에 알린다", async ({ page }, testInfo) => {
    // Arrange
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 지우기 실패 기록", testInfo) });

    try {
      await createComment({ recordId, content: "남아야 하는 댓글" });
      await openRecord(page, recordId);
      const release = await holdCommentRequest(page, "DELETE", "abort");

      // Act
      await getComment(page, "남아야 하는 댓글").getByRole("button", { name: "댓글 삭제" }).click();
      await page.getByRole("dialog", { name: "이 댓글을 지울까요?" }).getByRole("button", { name: "삭제", exact: true }).click();
      await expect(getComments(page)).toHaveCount(0);
      release();

      // Assert
      const notice = page.getByRole("alert").filter({ hasText: "댓글을 지우지 못했어요." });
      await expect(notice).toBeVisible();
      await expect(getComment(page, "남아야 하는 댓글")).toHaveCount(1);
      await expect(getHeading(page)).toBeFocused();
      // 안내는 제목 바로 아래, 목록 위에 있다
      const [noticeBox, listBox] = await Promise.all([notice.boundingBox(), getCommentList(page).boundingBox()]);
      expect(noticeBox?.y ?? 0).toBeLessThan(listBox?.y ?? 0);

      // Act: 다시 지우면 지난 안내는 사라진다
      await page.unroute(COMMENTS_ROUTE);
      await getComment(page, "남아야 하는 댓글").getByRole("button", { name: "댓글 삭제" }).click();
      await page.getByRole("dialog", { name: "이 댓글을 지울까요?" }).getByRole("button", { name: "삭제", exact: true }).click();

      // Assert
      await expect(notice).toHaveCount(0);
      await page.waitForLoadState("networkidle");
      await expect(getComments(page)).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("지웠는데 0행이 지워져 댓글이 남아 있으면 다시 받은 목록대로 다시 보인다", async ({ page }, testInfo) => {
    // Arrange: 세션이 바뀌어 0행이 지워지면 오류는 없지만, 새로 받은 목록에 댓글이 남는다
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 0행 기록", testInfo) });

    try {
      await createComment({ recordId, content: "남아 있는 댓글" });
      await openRecord(page, recordId);
      await page.route("**/rest/v1/comments*", (route) => (route.request().method() === "DELETE" ? route.fulfill({ status: 204 }) : route.continue()));

      // Act
      await getComment(page, "남아 있는 댓글").getByRole("button", { name: "댓글 삭제" }).click();
      const dialog = page.getByRole("dialog", { name: "이 댓글을 지울까요?" });
      await dialog.getByRole("button", { name: "삭제", exact: true }).click();

      // Assert
      await expect(dialog).toBeHidden();
      await expect(getComment(page, "남아 있는 댓글")).toHaveCount(1);
      await expect(page.locator("main").getByRole("alert")).toHaveCount(0);
    } finally {
      await deleteRecord();
    }
  });

  test("쓰는 사이 상대가 기록을 지우면 다시 시도하라는 대신 기록이 지워졌다고 알린다", async ({ page }, testInfo) => {
    // Arrange
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 지워진 댓글 기록", testInfo) });

    try {
      await openRecord(page, recordId);
      await deleteRecordWithFiles(recordId);

      // Act
      await getCommentInput(page).fill("늦게 쓴 댓글");
      await getSendButton(page).click();

      // Assert: 먼저 붙인 댓글은 빠지고 쓴 글은 칸에 돌아온다
      await expect(page.getByRole("alert").filter({ hasText: "이 기록은 지워져서 댓글을 남길 수 없어요." })).toBeVisible();
      await expect(getComments(page)).toHaveCount(0);
      await expect(getCommentInput(page)).toHaveValue("늦게 쓴 댓글");
    } finally {
      await deleteRecord();
    }
  });

  test("댓글이 많아도 끝까지 내리면 입력 칸과 남기기 버튼이 홈 표시줄 위에 보인다", async ({ page, safeArea }, testInfo) => {
    // Arrange: 입력 칸이 첫 화면 아래로 밀리도록 댓글을 여러 개 단다
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 댓글 많은 기록", testInfo) });

    try {
      for (const order of [1, 2, 3, 4, 5, 6]) await createComment({ recordId, content: `${order}번째 댓글 `.repeat(12) });
      await openRecord(page, recordId);
      const viewportHeight = page.viewportSize()?.height ?? 0;

      // Act
      await getScrollArea(page).evaluate((element) => element.scrollTo(0, element.scrollHeight));

      // Assert
      for (const target of [getCommentInput(page), getSendButton(page)]) {
        const box = await target.boundingBox();
        expect(box).not.toBeNull();
        // 제목 줄 수에 따라 위치가 소수점으로 떨어져, 끝까지 내려도 0.5px 미만은 남을 수 있다(screen-fit의 toBeCloseTo(…, 0)과 같은 기준)
        expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThan(viewportHeight - safeArea.bottom + 0.5);
      }

      // Act: 입력 칸을 누르면 칸이 화면 안에 있다(실제 아이폰 키보드는 E2E로 띄울 수 없어 기기에서 따로 본다)
      await getScrollArea(page).evaluate((element) => element.scrollTo(0, 0));
      await getCommentInput(page).focus();

      // Assert
      await expect(getCommentInput(page)).toBeInViewport({ ratio: 1 });
    } finally {
      await deleteRecord();
    }
  });
});

test.describe("상대 계정으로 들어가면", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("E2E 계정이 단 댓글은 지울 수 없고, 상대가 남긴 댓글에는 삭제 버튼이 붙는다", async ({ page }, testInfo) => {
    // Arrange
    const recordId = randomUUID();
    const deleteRecord = await createDisposableRecord({ id: recordId, title: createTestName("E2E 상대 댓글 기록", testInfo) });
    const password = randomUUID();
    const partnerNickname = getPartnerNickname();
    const partner = await createDisposableMember(password, partnerNickname);

    try {
      await createComment({ recordId, content: "E2E 계정이 단 댓글" });
      await signInToHome(page, partner.email, password);
      await openRecord(page, recordId);
      const memberComment = getComment(page, "E2E 계정이 단 댓글");
      await expect(memberComment.getByRole("img", { name: `작성자 ${E2E_MEMBER.nickname}` })).toBeVisible();
      await expect(memberComment.getByRole("button", { name: "댓글 삭제" })).toHaveCount(0);

      // Act
      await getCommentInput(page).fill("상대 계정이 단 댓글");
      await getSendButton(page).click();

      // Assert
      const partnerComment = getComment(page, "상대 계정이 단 댓글");
      await expect(partnerComment.getByRole("img", { name: `작성자 ${partnerNickname}` })).toBeVisible();
      await expect(partnerComment.getByRole("button", { name: "댓글 삭제" })).toHaveCount(1);
    } finally {
      await deleteRecord();
      await partner.remove();
    }
  });
});
