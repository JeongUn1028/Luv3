import { randomUUID } from "node:crypto";
import type { Page } from "@playwright/test";
import { LOGIN_PATH, SETTINGS_PATH, SIGN_OUT_PATH } from "@/lib/auth/paths";
import { signInToHome } from "./support/actions";
import { createDisposableMember, getPushNotifyRow, getPushSubscriptionEndpoints } from "./support/seed";
import { expect, openScreen, test } from "./support/test";

// 구독 행을 세므로, 두 기기 프로젝트가 나란히 돌아도 섞이지 않게 테스트마다 임시 계정을 쓴다
test.use({ storageState: { cookies: [], origins: [] } });

const IPHONE_SAFARI_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/**
 * 브라우저의 알림 구독을 가짜로 대신한다. 실제 구독은 구글 알림 서버에 접속해야 해 CI에서 흔들리고,
 * 실제로 보내는 일은 이 테스트가 다루지 않는다. 서비스 워커 등록과 구독 만들기·끊기만 흉내 낸다
 */
const useFakePushManager = async (page: Page, permission: NotificationPermission = "granted"): Promise<void> => {
  await page.addInitScript((initialPermission: NotificationPermission) => {
    let current: PushSubscription | null = null;
    let notificationPermission = initialPermission;
    const pushManager = {
      getSubscription: async () => current,
      subscribe: async ({ applicationServerKey }: PushSubscriptionOptionsInit) => {
        const endpoint = `https://push.example/e2e-${crypto.randomUUID()}`;
        const key = new Uint8Array(applicationServerKey as ArrayBuffer);
        current = {
          endpoint,
          options: { applicationServerKey: key.buffer, userVisibleOnly: true },
          toJSON: () => ({ endpoint, expirationTime: null, keys: { p256dh: "e2e-key", auth: "e2e-auth" } }),
          unsubscribe: async () => {
            current = null;
            return true;
          },
        } as unknown as PushSubscription;
        return current;
      },
    };
    const registration = { pushManager } as unknown as ServiceWorkerRegistration;
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      // 실제 서비스 워커 컨테이너처럼 메시지 이벤트를 받을 수 있게 EventTarget 위에 만든다(앱 아이콘 숫자, #364)
      value: Object.assign(new EventTarget(), {
        register: async () => registration,
        ready: Promise.resolve(registration),
        getRegistration: async () => registration,
      }),
    });
    Object.defineProperty(Notification, "permission", { configurable: true, get: () => notificationPermission });
    Notification.requestPermission = async () => {
      if (notificationPermission === "default") notificationPermission = "granted";
      return notificationPermission;
    };
  }, permission);
};

const getSection = (page: Page) => page.getByRole("region", { name: "알림" });

test.describe("설정 알림 칸", () => {
  let memberId: string;
  let email: string;
  let password: string;
  let removeMember: () => Promise<void>;

  test.beforeEach(async () => {
    password = randomUUID();
    ({ id: memberId, email, remove: removeMember } = await createDisposableMember(password));
  });

  test.afterEach(async () => {
    await removeMember();
  });

  test("알림을 켜면 이 기기의 구독이 저장되고, 끄면 지워진다", async ({ page }) => {
    // Arrange
    await useFakePushManager(page, "default");
    await signInToHome(page, email, password);
    await openScreen(page, SETTINGS_PATH, getSection(page).getByRole("button", { name: "알림 켜기" }));

    // Act: 켜기
    await getSection(page).getByRole("button", { name: "알림 켜기" }).click();

    // Assert
    await expect(getSection(page).getByText("받는 중")).toBeVisible();
    await expect(getSection(page).getByRole("button", { name: "시험 알림 보내기" })).toHaveCount(0);
    await expect.poll(() => getPushSubscriptionEndpoints(memberId)).toHaveLength(1);

    // Act: 끄기
    await getSection(page).getByRole("button", { name: "이 기기에서 알림 끄기" }).click();

    // Assert
    await expect(getSection(page).getByRole("button", { name: "알림 켜기" })).toBeVisible();
    await expect.poll(() => getPushSubscriptionEndpoints(memberId)).toEqual([]);
  });

  // 시안 4번 A: 켠 뒤에는 종류별 스위치가 보이고, 설정은 사람마다 하나라 다시 열어도 그대로다
  test("알림을 켜면 종류별 스위치가 보이고, 끈 종류는 다시 열어도 꺼져 있다", async ({ page }) => {
    // Arrange
    await useFakePushManager(page);
    await signInToHome(page, email, password);
    await openScreen(page, SETTINGS_PATH, getSection(page).getByRole("button", { name: "알림 켜기" }));
    await getSection(page).getByRole("button", { name: "알림 켜기" }).click();
    const eventSwitch = getSection(page).getByRole("switch", { name: "새 일정" });
    await expect(getSection(page).getByText("이 기기에서 받는 중")).toBeVisible();
    for (const name of ["새 기록", "댓글", "새 일정"]) {
      await expect(getSection(page).getByRole("switch", { name })).toBeChecked();
    }

    // Act
    await eventSwitch.click();

    // Assert
    await expect(eventSwitch).not.toBeChecked();
    await expect.poll(() => getPushNotifyRow(memberId)).toEqual({ notify_record: true, notify_comment: true, notify_event: false });

    // Act: 다시 열기. 가짜 구독은 문서마다 새로 만들어져, 다른 기기에서 켠 것처럼 다시 켠다
    await page.reload();
    await getSection(page).getByRole("button", { name: "알림 켜기" }).click();

    // Assert: 종류 설정은 사람마다 하나라 기기와 상관없이 그대로다
    await expect(getSection(page).getByRole("switch", { name: "새 일정" })).not.toBeChecked();
    await expect(getSection(page).getByRole("switch", { name: "새 기록" })).toBeChecked();
  });

  // 로그아웃한 뒤에도 이 기기로 상대 활동 알림이 오지 않게 한다
  test("로그아웃하면 이 기기의 구독을 지운다", async ({ page }) => {
    // Arrange
    await useFakePushManager(page);
    await signInToHome(page, email, password);
    await openScreen(page, SETTINGS_PATH, getSection(page).getByRole("button", { name: "알림 켜기" }));
    await getSection(page).getByRole("button", { name: "알림 켜기" }).click();
    await expect.poll(() => getPushSubscriptionEndpoints(memberId)).toHaveLength(1);

    // Act
    await page.getByRole("button", { name: "로그아웃" }).click();

    // Assert
    await page.waitForURL(`**${LOGIN_PATH}`);
    expect(await getPushSubscriptionEndpoints(memberId)).toEqual([]);
  });

  // 로그아웃이 실패해 그대로 로그인돼 있으면 알림도 그대로 와야 한다(#364 리뷰)
  test("로그아웃하지 못하면 이 기기의 구독을 그대로 둔다", async ({ page }) => {
    // Arrange
    await useFakePushManager(page);
    await signInToHome(page, email, password);
    await openScreen(page, SETTINGS_PATH, getSection(page).getByRole("button", { name: "알림 켜기" }));
    await getSection(page).getByRole("button", { name: "알림 켜기" }).click();
    await expect.poll(() => getPushSubscriptionEndpoints(memberId)).toHaveLength(1);
    await page.route(`**${SIGN_OUT_PATH}`, (route) => route.abort("internetdisconnected"));

    // Act
    await page.getByRole("button", { name: "로그아웃" }).click();

    // Assert
    await expect(page.getByRole("alert").filter({ hasText: "로그아웃하지 못했어요" })).toBeVisible();
    expect(await getPushSubscriptionEndpoints(memberId)).toHaveLength(1);
    await expect(getSection(page).getByRole("button", { name: "이 기기에서 알림 끄기" })).toBeVisible();
  });

  test("알림을 거절한 기기에는 켜기 버튼 대신 아이폰 설정에서 허용하라고 안내한다", async ({ page }) => {
    // Arrange
    await useFakePushManager(page, "denied");
    await signInToHome(page, email, password);

    // Act
    await openScreen(page, SETTINGS_PATH, getSection(page).getByText("알림을 허용하지 않은 기기예요", { exact: false }));

    // Assert
    await expect(getSection(page).getByRole("button")).toHaveCount(0);
  });

  test.describe("아이폰 Safari", () => {
    test.use({ userAgent: IPHONE_SAFARI_USER_AGENT });

    // 아이폰은 홈 화면에 추가한 앱에서만 알림 API가 생긴다
    test("홈 화면 앱이 아니면 홈 화면에 추가하라고 안내한다", async ({ page }) => {
      // Arrange
      await page.addInitScript(() => {
        Reflect.deleteProperty(window, "PushManager");
      });
      await signInToHome(page, email, password);

      // Act
      await openScreen(page, SETTINGS_PATH, getSection(page).getByText("홈 화면에 추가한 Luv3에서만 켤 수 있어요", { exact: false }));

      // Assert
      await expect(getSection(page).getByRole("button")).toHaveCount(0);
    });
  });

  test("실제 서비스 워커가 앱 전체 범위로 등록되고, 저장해 두지 않게 받는다", async ({ page, request }) => {
    // Arrange
    await signInToHome(page, email, password);

    // Act
    await openScreen(page, SETTINGS_PATH, getSection(page).getByRole("button", { name: "알림 켜기" }));
    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return { scope: ready.scope, script: ready.active?.scriptURL };
    });
    const response = await request.get("/sw.js");

    // Assert
    expect(new URL(registration.scope).pathname).toBe("/");
    expect(new URL(registration.script ?? "").pathname).toBe("/sw.js");
    expect(response.headers()["cache-control"]).toBe("no-cache");
  });
});
