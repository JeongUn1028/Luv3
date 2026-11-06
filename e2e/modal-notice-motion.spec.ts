import { randomUUID } from "node:crypto";
import type { Locator, Page, Route } from "@playwright/test";
import { TODOS_PATH } from "@/lib/todos/list";
import { readAnimations, recordAnimations, waitForPaint } from "./support/motion";
import { createDisposableTodo, deleteTodosByContent } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

const getDeleteButton = (page: Page): Locator => page.getByRole("button", { name: "삭제", exact: true }).locator("visible=true");

/** 이 뒤로 나가는 할 일 삭제 요청을 모은다. 창이 닫힌 것만으로는 삭제가 눌렸는지 알 수 없다 */
const trackTodoDeletes = (page: Page): string[] => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "DELETE" && request.url().includes("/rest/v1/todos")) requests.push(request.url());
  });
  return requests;
};

const openDisposableTodo = async (page: Page, label: string, name: string): Promise<() => Promise<void>> => {
  const id = randomUUID();
  const deleteTodo = await createDisposableTodo({ id, content: `${label} ${name} ${id.slice(0, 8)}` });
  await openScreen(page, `/todos/${id}/edit`, getDeleteButton(page));
  return deleteTodo;
};

test.describe("움직임을 켠 기기에서", () => {
  test.use({ contextOptions: { reducedMotion: "no-preference" } });

  test("창이 움직이며 열리고 닫히며, 닫히는 동안 다른 버튼이 눌리지 않고 초점이 돌아온다", async ({ page }, testInfo) => {
    // Arrange
    const deleteTodo = await openDisposableTodo(page, "창 움직임", testInfo.project.name);
    const deleteRequests = trackTodoDeletes(page);

    try {
      await recordAnimations(page);

      // Act: 열기
      await getDeleteButton(page).click();
      const dialog = page.getByRole("dialog", { name: "이 항목을 지울까요?" });
      await expect(dialog).toBeVisible();

      // Assert
      await expect.poll(() => readAnimations(page)).toEqual(expect.arrayContaining(["modal-sheet-in", "modal-backdrop-in"]));

      // Arrange: 닫기를 누른 뒤 곧바로 "삭제"를 누를 자리
      const confirmBox = await dialog.getByRole("button", { name: "삭제" }).boundingBox();
      if (!confirmBox) throw new Error("삭제 버튼이 보이지 않습니다");

      // Act: 취소 직후 삭제 자리를 누른다
      await dialog.getByRole("button", { name: "취소" }).click();
      await page.mouse.click(confirmBox.x + confirmBox.width / 2, confirmBox.y + confirmBox.height / 2);

      // Assert: 지워지지 않고 닫히며 초점이 돌아온다
      await expect.poll(() => readAnimations(page)).toEqual(expect.arrayContaining(["modal-sheet-out", "modal-backdrop-out"]));
      await expect(dialog).toBeHidden();
      await waitForPaint(page);
      expect(deleteRequests).toEqual([]);
      await expect(getDeleteButton(page)).toBeFocused();

      // Act: 닫힌 창을 다시 연다
      await getDeleteButton(page).click();

      // Assert: 닫히던 표시가 남아 있지 않다
      await expect(dialog).toBeVisible();
      await expect(dialog).not.toHaveAttribute("data-closing");

      // Act: Esc도 같은 움직임으로 닫는다
      await recordAnimations(page);
      await page.keyboard.press("Escape");

      // Assert
      await expect.poll(() => readAnimations(page)).toContain("modal-sheet-out");
      await expect(dialog).toBeHidden();
    } finally {
      await deleteTodo();
    }
  });

  test("Esc로 닫는 동안 Enter를 눌러도 지워지지 않는다", async ({ page }, testInfo) => {
    // Arrange: 삭제 버튼에 초점을 둔다
    const deleteTodo = await openDisposableTodo(page, "창 키보드", testInfo.project.name);
    const deleteRequests = trackTodoDeletes(page);

    try {
      await getDeleteButton(page).click();
      const dialog = page.getByRole("dialog", { name: "이 항목을 지울까요?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "삭제" }).focus();

      // Act: 화면이 다시 그려지기 전에 두 키가 닿게 기다리지 않고 함께 보낸다
      await Promise.all([page.keyboard.press("Escape"), page.keyboard.press("Enter")]);

      // Assert
      await expect(dialog).toBeHidden();
      await waitForPaint(page);
      expect(deleteRequests).toEqual([]);
      await expect(getDeleteButton(page)).toBeFocused();
    } finally {
      await deleteTodo();
    }
  });

  test("커플 사진 창에서 사진 바꾸기를 누르면 바로 사진 고르기가 열린다", async ({ page }) => {
    // Arrange
    const openMenu = page.getByRole("button", { name: "커플 사진 바꾸기" });
    await openScreen(page, "/", openMenu);
    await openMenu.click();
    const menu = page.getByRole("dialog", { name: "커플 사진", exact: true });
    await expect(menu).toBeVisible();

    // Act
    const fileChooser = page.waitForEvent("filechooser");
    await menu.getByRole("button", { name: "사진 바꾸기" }).click();

    // Assert
    await fileChooser;
    await expect(menu).toBeHidden();
  });

  test("커플 사진 창의 내용이 바뀔 때만 내용이 나타나는 움직임을 쓴다", async ({ page }) => {
    // Arrange
    const openMenu = page.getByRole("button", { name: "커플 사진 바꾸기" });
    await openScreen(page, "/", openMenu);
    await recordAnimations(page);

    // Act
    await openMenu.click();
    const menu = page.getByRole("dialog", { name: "커플 사진", exact: true });
    await expect(menu).toBeVisible();
    await waitForPaint(page);

    // Assert
    expect(await readAnimations(page)).not.toContain("modal-step-in");

    // Act
    await menu.getByRole("button", { name: "사진 지우기" }).click();

    // Assert
    await expect.poll(() => readAnimations(page)).toContain("modal-step-in");

    await page.getByRole("dialog", { name: "커플 사진을 지울까요?" }).getByRole("button", { name: "취소" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();
  });

  test("저장 알림이 내려왔다가 닫으면 위로 사라진다", async ({ page }, testInfo) => {
    // Arrange: 저장을 붙들어 폼을 떠난 뒤에 끝나게 한다
    const content = `E2E 움직임 알림 ${testInfo.project.name} ${randomUUID().slice(0, 8)}`;
    await openScreen(page, "/todos/new", page.locator("#todo-content"));
    let release = (): void => undefined;
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route("**/rest/v1/todos*", async (route: Route) => {
      if (route.request().method() === "POST") await released;
      await route.continue();
    });

    try {
      await page.locator("#todo-content").fill(content);
      await page.locator('main button[type="submit"]').locator("visible=true").tap();
      await page.getByRole("link", { name: "뒤로" }).locator("visible=true").tap();
      await page.waitForURL(`**${TODOS_PATH}`);
      await recordAnimations(page);

      // Act
      release();
      const notice = page.getByRole("status").filter({ has: page.getByRole("button", { name: "닫기" }) });

      // Assert
      await expect(notice).toBeVisible();
      await expect.poll(() => readAnimations(page)).toContain("save-notice-in");

      // Act: 칸이 접히기 시작하는 순간 닫기를 한 번 더 누른다(글자판의 Enter처럼 포인터를 거치지 않는다)
      await page.evaluate(() => {
        const root = document.documentElement;
        const slot = document.querySelector(".save-notice-slot");
        root.dataset.noticePhases = "";
        new MutationObserver(() => {
          const phase = slot?.getAttribute("data-phase");
          root.dataset.noticePhases += `${phase} `;
          if (phase === "collapsing" && root.dataset.noticePhases === "leaving collapsing ") slot?.querySelector("button")?.click();
        }).observe(slot as Element, { attributes: true, attributeFilter: ["data-phase"] });
      });
      await notice.getByRole("button", { name: "닫기" }).click();

      // Assert: 되돌아가지 않고 사라지며, 등장 움직임은 다시 돌지 않는다
      await expect.poll(() => readAnimations(page)).toContain("save-notice-out");
      await expect(notice).toHaveCount(0);
      expect(await page.locator("html").getAttribute("data-notice-phases")).toBe("leaving collapsing ");
      expect((await readAnimations(page)).filter((name) => name === "save-notice-in")).toHaveLength(1);
    } finally {
      await deleteTodosByContent(content);
    }
  });
});

test.describe("동작 줄이기를 켠 기기에서", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("창은 움직임 없이 열리고 바로 닫힌다", async ({ page }, testInfo) => {
    // Arrange
    const deleteTodo = await openDisposableTodo(page, "창 움직임 없음", testInfo.project.name);

    try {
      await recordAnimations(page);

      // Act
      await getDeleteButton(page).click();
      const dialog = page.getByRole("dialog", { name: "이 항목을 지울까요?" });
      await expect(dialog).toBeVisible();
      await dialog.getByRole("button", { name: "취소" }).click();

      // Assert
      await expect(dialog).toBeHidden();
      await waitForPaint(page);
      expect((await readAnimations(page)).filter((name) => name.startsWith("modal-"))).toEqual([]);
    } finally {
      await deleteTodo();
    }
  });
});
