import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { PUSH_RECEIVED_MESSAGE } from "./message";

// public/sw.js는 번들을 거치지 않는 그냥 스크립트라, 가짜 서비스 워커 전역(self)을 만들어 그 안에서 실행해 본다
const SOURCE = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const ORIGIN = "https://luv3.vercel.app";

interface FakeWindow {
  url: string;
  visibilityState?: DocumentVisibilityState;
  focus: () => Promise<FakeWindow>;
  navigate: (url: string) => Promise<unknown>;
  postMessage?: (message: unknown) => void;
}

type Listener = (event: Record<string, unknown>) => void;

interface LoadOptions {
  windows?: FakeWindow[];
  /** 서비스 워커의 navigator. 앱 아이콘 숫자(setAppBadge)를 지원하지 않는 브라우저는 `{}` */
  navigator?: { setAppBadge?: (count: number) => Promise<void> };
}

const loadServiceWorker = ({ windows = [], navigator = {} }: LoadOptions = {}) => {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(() => Promise.resolve());
  const openWindow = vi.fn(() => Promise.resolve(undefined));
  const self = {
    navigator,
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    registration: { showNotification },
    clients: { claim: vi.fn(() => Promise.resolve()), matchAll: vi.fn(() => Promise.resolve(windows)), openWindow },
    location: { origin: ORIGIN },
  };
  runInNewContext(SOURCE, { self, URL });

  /** 이벤트를 보내고 waitUntil에 넘긴 작업이 끝날 때까지 기다린다 */
  const dispatch = async (type: string, event: Record<string, unknown>): Promise<void> => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
  };

  return { listeners, showNotification, openWindow, dispatch };
};

const pushData = (text: string) => ({ json: () => JSON.parse(text) as unknown });

const clickEvent = (url: unknown) => ({ notification: { close: vi.fn(), data: { url } } });

const fakeWindow = (navigate: FakeWindow["navigate"] = () => Promise.resolve(undefined)): FakeWindow => {
  const window: FakeWindow = { url: `${ORIGIN}/records`, focus: vi.fn(() => Promise.resolve(window)), navigate: vi.fn(navigate) };
  return window;
};

describe("서비스 워커 알림 받기", () => {
  it("받은 내용의 제목·본문으로 알림을 보이고, 누르면 열 주소를 알림에 담는다", async () => {
    // Arrange
    const worker = loadServiceWorker();

    // Act
    await worker.dispatch("push", { data: pushData('{"title":"새 기록","body":"한강 피크닉","url":"/dates/1"}') });

    // Assert
    expect(worker.showNotification).toHaveBeenCalledWith("새 기록", {
      body: "한강 피크닉",
      icon: "/icon-192.png",
      data: { url: "/dates/1" },
    });
  });

  // 아이폰은 알림을 보이지 않고 받기만 하면 구독을 끊는다
  it.each([
    ["내용이 없으면", undefined],
    ["JSON이 아니면", pushData("not json")],
    ["제목이 비었으면", pushData('{"title":"","body":1}')],
  ])("%s 기본 제목으로라도 알림을 보인다", async (_, data) => {
    // Arrange
    const worker = loadServiceWorker();

    // Act
    await worker.dispatch("push", { data });

    // Assert
    expect(worker.showNotification).toHaveBeenCalledWith("Luv3", { body: "", icon: "/icon-192.png", data: { url: "/" } });
  });

  // 화면을 저장해 두지 않는다(오프라인 캐시 없음, #29 정한 것 1번)
  it("화면 요청(fetch)에는 끼어들지 않는다", () => {
    // Act
    const worker = loadServiceWorker();

    // Assert
    expect([...worker.listeners.keys()].sort()).toEqual(["activate", "install", "notificationclick", "push"]);
  });
});

describe("서비스 워커 앱 아이콘 숫자", () => {
  it("알림에 숫자가 있으면 알림과 함께 앱 아이콘 숫자를 바꾼다", async () => {
    // Arrange
    const setAppBadge = vi.fn(() => Promise.resolve());
    const worker = loadServiceWorker({ navigator: { setAppBadge } });

    // Act
    await worker.dispatch("push", { data: pushData('{"title":"새 기록","body":"","url":"/","badge":3}') });

    // Assert
    expect(setAppBadge).toHaveBeenCalledWith(3);
    expect(worker.showNotification).toHaveBeenCalled();
  });

  it.each([
    ["숫자가 없는 알림(시험 알림)", '{"title":"시험","body":"","url":"/"}'],
    ["정수가 아닌 숫자", '{"title":"새 기록","body":"","url":"/","badge":1.5}'],
    ["음수", '{"title":"새 기록","body":"","url":"/","badge":-1}'],
  ])("%s면 숫자를 바꾸지 않는다", async (_, text) => {
    // Arrange
    const setAppBadge = vi.fn(() => Promise.resolve());
    const worker = loadServiceWorker({ navigator: { setAppBadge } });

    // Act
    await worker.dispatch("push", { data: pushData(text) });

    // Assert
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  // 앱을 보고 있으면 받은 알림을 이미 본 셈이다. 숫자를 띄우면 앱을 나간 뒤 아이콘에 본 알림 수가 남는다
  it("앱을 보고 있는 창이 있으면 숫자를 띄우지 않고, 그 창에 받았다고 알려 서버 숫자를 지우게 한다", async () => {
    // Arrange
    const setAppBadge = vi.fn(() => Promise.resolve());
    const shown: FakeWindow = { ...fakeWindow(), visibilityState: "visible", postMessage: vi.fn() };
    const hidden: FakeWindow = { ...fakeWindow(), visibilityState: "hidden", postMessage: vi.fn() };
    const worker = loadServiceWorker({ windows: [shown, hidden], navigator: { setAppBadge } });

    // Act
    await worker.dispatch("push", { data: pushData('{"title":"새 기록","body":"","url":"/","badge":1}') });

    // Assert
    expect(setAppBadge).not.toHaveBeenCalled();
    expect(shown.postMessage).toHaveBeenCalledWith({ type: PUSH_RECEIVED_MESSAGE });
    expect(hidden.postMessage).not.toHaveBeenCalled();
    expect(worker.showNotification).toHaveBeenCalled();
  });

  it("앱 창에 보내는 메시지 종류는 앱이 기다리는 값과 같다", () => {
    expect(SOURCE).toContain(`const PUSH_RECEIVED_MESSAGE = "${PUSH_RECEIVED_MESSAGE}";`);
  });

  it("숨겨진 창만 있으면 숫자를 띄운다", async () => {
    // Arrange
    const setAppBadge = vi.fn(() => Promise.resolve());
    const hidden: FakeWindow = { ...fakeWindow(), visibilityState: "hidden", postMessage: vi.fn() };
    const worker = loadServiceWorker({ windows: [hidden], navigator: { setAppBadge } });

    // Act
    await worker.dispatch("push", { data: pushData('{"title":"새 기록","body":"","url":"/","badge":2}') });

    // Assert
    expect(setAppBadge).toHaveBeenCalledWith(2);
    expect(hidden.postMessage).not.toHaveBeenCalled();
  });

  it("숫자를 지원하지 않거나 바꾸지 못해도 알림은 보인다", async () => {
    // Arrange
    const unsupported = loadServiceWorker();
    const failing = loadServiceWorker({ navigator: { setAppBadge: () => Promise.reject(new Error("not allowed")) } });
    const data = pushData('{"title":"새 기록","body":"","url":"/","badge":2}');

    // Act
    await unsupported.dispatch("push", { data });
    await failing.dispatch("push", { data });

    // Assert
    expect(unsupported.showNotification).toHaveBeenCalled();
    expect(failing.showNotification).toHaveBeenCalled();
  });
});

describe("서비스 워커 알림 누르기", () => {
  it("열린 앱이 없으면 알림에 담긴 앱 안 주소로 새로 연다", async () => {
    // Arrange
    const worker = loadServiceWorker();
    const event = clickEvent("/dates/1?photo=2");

    // Act
    await worker.dispatch("notificationclick", event);

    // Assert
    expect(event.notification.close).toHaveBeenCalled();
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/dates/1?photo=2`);
  });

  // URL 해석은 탭·줄바꿈을 지운 뒤 하므로 "/<탭>/evil"도 다른 사이트 주소가 된다
  it.each(["https://evil.example/phish", "//evil.example", "/\\evil.example", "/\t/evil.example", "/\n/evil.example", 42, undefined])(
    "앱 밖 주소(%s)가 오면 홈을 연다",
    async (url) => {
      // Arrange
      const worker = loadServiceWorker();

      // Act
      await worker.dispatch("notificationclick", clickEvent(url));

      // Assert
      expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/`);
    },
  );

  it("열린 앱이 있으면 새 창 대신 그 창을 앞으로 가져와 옮긴다", async () => {
    // Arrange
    const opened = fakeWindow();
    const worker = loadServiceWorker({ windows: [opened] });

    // Act
    await worker.dispatch("notificationclick", clickEvent("/settings"));

    // Assert
    expect(opened.focus).toHaveBeenCalled();
    expect(opened.navigate).toHaveBeenCalledWith(`${ORIGIN}/settings`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("열린 창을 옮기지 못하면 새로 연다", async () => {
    // Arrange
    const opened = fakeWindow(() => Promise.reject(new TypeError("not controlled")));
    const worker = loadServiceWorker({ windows: [opened] });

    // Act
    await worker.dispatch("notificationclick", clickEvent("/settings"));

    // Assert
    expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/settings`);
  });
});
