import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { PUSH_OPEN_MESSAGE, PUSH_RECEIVED_MESSAGE } from "./message";

// public/sw.js는 번들을 거치지 않는 그냥 스크립트라, 가짜 서비스 워커 전역(self)을 만들어 그 안에서 실행해 본다
const SOURCE = readFileSync(new URL("../../../public/sw.js", import.meta.url), "utf8");
const OFFLINE_PAGE = readFileSync(new URL("../../../public/offline.html", import.meta.url));
const ORIGIN = "https://luv3.vercel.app";
const OFFLINE_PAGE_PATH = "/offline.html";

interface FakeWindow {
  url: string;
  visibilityState?: DocumentVisibilityState;
  focus: () => Promise<FakeWindow>;
  navigate: (url: string) => Promise<unknown>;
  postMessage?: (message: unknown, transfer?: MessagePort[]) => void;
}

type Listener = (event: Record<string, unknown>) => void;

interface LoadOptions {
  windows?: FakeWindow[];
  /** 서비스 워커의 navigator. 앱 아이콘 숫자(setAppBadge)를 지원하지 않는 브라우저는 `{}` */
  navigator?: { setAppBadge?: (count: number) => Promise<void> };
  /** 서버 요청. 끊긴 상태는 거절로 흉내 낸다 */
  fetch?: (request: Request) => Promise<Response>;
  /** 미리 들어 있는 저장소. 이름 → (경로 → 응답 본문) */
  cached?: Record<string, Record<string, string>>;
  /** 화면 요청 미리 시작하기를 지원하지 않는 브라우저는 false */
  hasNavigationPreload?: boolean;
}

/** 브라우저 저장소(CacheStorage)를 흉내 낸다. 경로만으로 찾는다 */
const createFakeCaches = (initial: Record<string, Record<string, string>>) => {
  const stores = new Map(Object.entries(initial).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  const toPath = (request: Request | string): string => new URL(typeof request === "string" ? request : request.url, ORIGIN).pathname;
  const open = (name: string) => {
    const store = stores.get(name) ?? new Map<string, string>();
    stores.set(name, store);
    return Promise.resolve({
      match: (request: Request | string) => {
        const body = store.get(toPath(request));
        return Promise.resolve(body === undefined ? undefined : new Response(body));
      },
      put: async (request: Request | string, response: Response) => {
        store.set(toPath(request), await response.text());
      },
    });
  };
  return {
    stores,
    caches: {
      open,
      keys: () => Promise.resolve([...stores.keys()]),
      delete: (name: string) => Promise.resolve(stores.delete(name)),
      match: (request: Request | string, options: { cacheName: string }) => open(options.cacheName).then((cache) => cache.match(request)),
    },
  };
};

const offline = (): Promise<Response> => Promise.reject(new TypeError("Failed to fetch"));

/** 서비스 워커 안의 상대 주소는 서비스 워커 출처를 기준으로 푼다 */
class WorkerRequest extends Request {
  constructor(input: string, init?: RequestInit) {
    super(new URL(input, ORIGIN), init);
  }
}

const loadServiceWorker = ({ windows = [], navigator = {}, fetch = offline, cached = {}, hasNavigationPreload = true }: LoadOptions = {}) => {
  const listeners = new Map<string, Listener>();
  const showNotification = vi.fn(() => Promise.resolve());
  const openWindow = vi.fn(() => Promise.resolve(undefined));
  const fetchRequest = vi.fn(fetch);
  const enablePreload = vi.fn(() => Promise.resolve());
  const { stores, caches } = createFakeCaches(cached);
  const self = {
    navigator,
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    skipWaiting: vi.fn(),
    registration: { showNotification, navigationPreload: hasNavigationPreload ? { enable: enablePreload } : undefined },
    clients: { claim: vi.fn(() => Promise.resolve()), matchAll: vi.fn(() => Promise.resolve(windows)), openWindow },
    caches,
    location: { origin: ORIGIN },
  };
  // 타이머는 부를 때의 전역을 써서, 테스트가 가짜 타이머로 바꿔도 따라가게 한다
  runInNewContext(SOURCE, {
    self,
    URL,
    MessageChannel,
    fetch: fetchRequest,
    Request: WorkerRequest,
    Response,
    // 정한 시간이 지나면 끊는 신호. 테스트가 가짜 타이머로 시간을 돌릴 수 있게 부를 때의 setTimeout을 쓴다
    AbortSignal: {
      timeout: (delay: number) => {
        const controller = new AbortController();
        setTimeout(() => controller.abort(new DOMException("시간 초과", "TimeoutError")), delay);
        return controller.signal;
      },
    },
    setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay),
    clearTimeout: (timer: ReturnType<typeof setTimeout>) => clearTimeout(timer),
  });

  /** 이벤트를 보내고 waitUntil에 넘긴 작업이 끝날 때까지 기다린다 */
  const dispatch = async (type: string, event: Record<string, unknown>): Promise<void> => {
    const pending: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => pending.push(promise) });
    await Promise.all(pending);
  };

  /** 요청을 보내고, 서비스 워커가 맡으면 돌려준 응답을, 맡지 않으면 undefined를 준다. 응답 뒤에 waitUntil로 넘긴 뒷일까지 기다린다 */
  const request = async (event: { request: Request; preloadResponse?: Promise<Response | undefined> }): Promise<Response | undefined> => {
    const pending: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    listeners.get("fetch")?.({
      preloadResponse: Promise.resolve(undefined),
      ...event,
      respondWith: (promise: Promise<Response>) => {
        responded = promise;
      },
      waitUntil: (promise: Promise<unknown>) => pending.push(promise),
    });
    const response = await responded;
    await Promise.all(pending);
    return response;
  };

  return { listeners, showNotification, openWindow, dispatch, request, fetchRequest, enablePreload, stores, self };
};

/** 안내 화면 내용의 SHA-256 앞 8글자. sw.js의 OFFLINE_PAGE_VERSION과 같아야 한다 */
const OFFLINE_PAGE_HASH = createHash("sha256").update(OFFLINE_PAGE).digest("hex").slice(0, 8);
const OFFLINE_CACHE = "luv3-offline";

/** 화면 열기 요청. 브라우저는 주소창·링크로 문서를 열 때 mode를 navigate로 보낸다 */
const navigation = (path: string, method = "GET"): Request => {
  const request = new Request(new URL(path, ORIGIN), { method });
  Object.defineProperty(request, "mode", { value: "navigate" });
  return request;
};

const served =
  (body: string, status = 200) =>
  (): Promise<Response> =>
    Promise.resolve(new Response(body, { status }));

const withOfflinePage = { [OFFLINE_CACHE]: { [OFFLINE_PAGE_PATH]: "안내 화면" } };

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

});

// 앱 화면은 저장하지 않고 끊긴 채 켤 때의 안내 화면 한 장만 저장한다(#29 정한 것 1번, #365)
describe("서비스 워커 끊긴 채 켤 때 안내 화면", () => {
  it("안내 화면 버전이 안내 화면 내용과 맞는다(안내 화면을 고치면 sw.js의 OFFLINE_PAGE_VERSION도 바꿔야 새로 저장된다)", () => {
    expect(SOURCE).toContain(`const OFFLINE_PAGE_VERSION = "${OFFLINE_PAGE_HASH}";`);
  });

  it("설치하면 안내 화면을 HTTP 저장본을 거치지 않고 새로 받아 저장하고, 기다리지 않고 바로 바꾼다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("안내 화면") });

    // Act
    await worker.dispatch("install", {});

    // Assert
    expect(worker.self.skipWaiting).toHaveBeenCalled();
    const [request] = worker.fetchRequest.mock.calls[0] ?? [];
    const url = new URL(request?.url ?? "");
    expect(url.pathname).toBe(OFFLINE_PAGE_PATH);
    // 주소에 버전을 붙여, 중간 저장소가 예전 안내 화면을 돌려주지 않게 한다
    expect(url.search).toBe(`?v=${OFFLINE_PAGE_HASH}`);
    expect(request?.cache).toBe("reload");
    expect(worker.stores.get(OFFLINE_CACHE)?.get(OFFLINE_PAGE_PATH)).toBe("안내 화면");
  });

  it("설치할 때 안내 화면을 받지 못해도 설치는 마친다(알림은 받아야 한다)", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: offline });

    // Act
    const install = worker.dispatch("install", {});

    // Assert
    await expect(install).resolves.toBeUndefined();
    expect(worker.self.skipWaiting).toHaveBeenCalled();
  });

  it("안내 화면 응답이 성공이 아니면 저장하지 않는다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("로그인 화면", 404) });

    // Act
    await worker.dispatch("install", {});

    // Assert
    expect(worker.stores.get(OFFLINE_CACHE)?.get(OFFLINE_PAGE_PATH)).toBeUndefined();
  });

  it("안내 화면 받기가 멈추면 정한 시간 뒤 끊고 설치를 마친다(알림 켜기가 서비스 워커를 기다리다 실패하지 않게)", async () => {
    vi.useFakeTimers();
    try {
      // Arrange: 답하지 않다가 끊기면 거절하는 서버
      const hanging = (request: Request) =>
        new Promise<Response>((_, reject) => request.signal.addEventListener("abort", () => reject(request.signal.reason)));
      const worker = loadServiceWorker({ fetch: hanging });
      let isInstalled = false;

      // Act
      const install = worker.dispatch("install", {}).then(() => {
        isInstalled = true;
      });
      await vi.advanceTimersByTimeAsync(4999);
      const isInstalledEarly = isInstalled;
      await vi.advanceTimersByTimeAsync(1);
      await install;

      // Assert
      expect(isInstalledEarly).toBe(false);
      expect(isInstalled).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("새 버전이 켜져도 저장해 둔 안내 화면을 지우지 않고, 화면 요청 미리 시작하기를 켠다", async () => {
    // Arrange: 새 버전 설치 때 새 안내 화면을 받지 못해 예전 안내 화면만 남은 경우
    const worker = loadServiceWorker({ cached: { [OFFLINE_CACHE]: { [OFFLINE_PAGE_PATH]: "예전 안내 화면" } } });

    // Act
    await worker.dispatch("activate", {});

    // Assert
    expect(worker.stores.get(OFFLINE_CACHE)?.get(OFFLINE_PAGE_PATH)).toBe("예전 안내 화면");
    expect(worker.enablePreload).toHaveBeenCalled();
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it("화면 요청 미리 시작하기를 지원하지 않는 브라우저에서도 켜진다", async () => {
    // Arrange
    const worker = loadServiceWorker({ hasNavigationPreload: false });

    // Act
    const activate = worker.dispatch("activate", {});

    // Assert
    await expect(activate).resolves.toBeUndefined();
    expect(worker.self.clients.claim).toHaveBeenCalled();
  });

  it("연결되어 있으면 화면 열기에 서버 응답을 그대로 돌려준다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("기록 화면"), cached: withOfflinePage });

    // Act
    const response = await worker.request({ request: navigation("/records") });

    // Assert
    expect(await response?.text()).toBe("기록 화면");
  });

  it("미리 시작한 서버 응답이 있으면 다시 요청하지 않고 그 응답을 돌려준다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("다시 받은 화면"), cached: withOfflinePage });

    // Act
    const response = await worker.request({ request: navigation("/records"), preloadResponse: Promise.resolve(new Response("미리 받은 화면")) });

    // Assert
    expect(await response?.text()).toBe("미리 받은 화면");
    expect(worker.fetchRequest).not.toHaveBeenCalled();
  });

  it("서버 오류는 안내 화면으로 바꾸지 않고 그대로 돌려준다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("서버 오류", 500), cached: withOfflinePage });

    // Act
    const response = await worker.request({ request: navigation("/records") });

    // Assert
    expect(response?.status).toBe(500);
    expect(await response?.text()).toBe("서버 오류");
  });

  it("연결이 끊겨 화면을 열지 못하면 저장해 둔 안내 화면을 돌려준다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: offline, cached: withOfflinePage });

    // Act
    const response = await worker.request({ request: navigation("/records") });

    // Assert
    expect(await response?.text()).toBe("안내 화면");
  });

  it("미리 시작한 서버 요청이 끊겨 실패해도 안내 화면을 돌려준다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: offline, cached: withOfflinePage });

    // Act
    const response = await worker.request({ request: navigation("/"), preloadResponse: Promise.reject(new TypeError("Failed to fetch")) });

    // Assert
    expect(await response?.text()).toBe("안내 화면");
  });

  it("끊겼는데 저장해 둔 안내 화면도 없으면 오류 응답을 돌려줘 지금처럼 브라우저 오류 화면이 나온다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: offline });

    // Act
    const response = await worker.request({ request: navigation("/records") });

    // Assert
    expect(response?.type).toBe("error");
  });

  it("설치 때 안내 화면을 받지 못했으면 다음에 화면을 열 때 저장한다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("받은 내용") });

    // Act
    await worker.request({ request: navigation("/records") });

    // Assert
    expect(worker.stores.get(OFFLINE_CACHE)?.get(OFFLINE_PAGE_PATH)).toBe("받은 내용");
  });

  it("안내 화면이 이미 저장돼 있으면 화면을 열 때 다시 받지 않는다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("기록 화면"), cached: withOfflinePage });

    // Act
    await worker.request({ request: navigation("/records") });

    // Assert
    expect(worker.fetchRequest).toHaveBeenCalledTimes(1);
  });

  it("한 번 저장했으면 다음 화면 열기부터는 저장소를 다시 보지 않는다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("화면") });
    await worker.dispatch("install", {});
    worker.stores.clear();

    // Act
    await worker.request({ request: navigation("/records") });

    // Assert: 저장소를 비워 둬도 다시 받지 않는다(설치 한 번 + 화면 열기 한 번)
    expect(worker.fetchRequest).toHaveBeenCalledTimes(2);
    expect(worker.stores.get(OFFLINE_CACHE)?.get(OFFLINE_PAGE_PATH)).toBeUndefined();
  });

  it("화면 열기가 아닌 요청(데이터·화면 조각·연결 확인)에는 끼어들지 않는다", async () => {
    // Arrange
    const worker = loadServiceWorker({ fetch: served("데이터") });

    // Act
    const data = await worker.request({ request: new Request(`${ORIGIN}/records?_rsc=1`) });
    const head = await worker.request({ request: navigation("/", "HEAD") });

    // Assert
    expect(data).toBeUndefined();
    expect(head).toBeUndefined();
    expect(worker.fetchRequest).not.toHaveBeenCalled();
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
    ["숫자가 없는 알림", '{"title":"Luv3","body":"","url":"/"}'],
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

  // 창을 통째로 옮기면 쓰던 글·고른 사진이 사라진다(#406). 앱이 스스로 옮기면 화면을 숨겨 두어 그대로 남는다
  it("열린 앱이 있으면 그 창을 앞으로 가져와 앱에 주소만 넘기고, 앱이 받았다고 답하면 창을 옮기지 않는다", async () => {
    // Arrange
    const opened = fakeWindow();
    const received: unknown[] = [];
    opened.postMessage = vi.fn((message: unknown, transfer: MessagePort[] = []) => {
      received.push(message);
      const [reply] = transfer;
      reply?.postMessage({ type: PUSH_OPEN_MESSAGE });
      reply?.close();
    });
    const worker = loadServiceWorker({ windows: [opened] });

    // Act
    await worker.dispatch("notificationclick", clickEvent("/dates/1?photo=2"));

    // Assert
    expect(opened.focus).toHaveBeenCalled();
    expect(received).toEqual([{ type: PUSH_OPEN_MESSAGE, url: `${ORIGIN}/dates/1?photo=2` }]);
    expect(opened.navigate).not.toHaveBeenCalled();
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  // 알림을 누르기 전에 열어 둔 예전 버전 앱은 메시지를 듣지 않는다
  it("앱이 정해진 시간 안에 답하지 않으면 그 창을 알림 주소로 옮긴다", async () => {
    vi.useFakeTimers();
    try {
      // Arrange
      const opened = fakeWindow();
      opened.postMessage = vi.fn();
      const worker = loadServiceWorker({ windows: [opened] });

      // Act
      const clicked = worker.dispatch("notificationclick", clickEvent("/settings"));
      await vi.advanceTimersByTimeAsync(3000);
      await clicked;

      // Assert
      expect(opened.postMessage).toHaveBeenCalled();
      expect(opened.navigate).toHaveBeenCalledWith(`${ORIGIN}/settings`);
      expect(worker.openWindow).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("앱이 답하지 않고 창도 옮기지 못하면 새로 연다", async () => {
    vi.useFakeTimers();
    try {
      // Arrange
      const opened = fakeWindow(() => Promise.reject(new TypeError("not controlled")));
      opened.postMessage = vi.fn();
      const worker = loadServiceWorker({ windows: [opened] });

      // Act
      const clicked = worker.dispatch("notificationclick", clickEvent("/settings"));
      await vi.advanceTimersByTimeAsync(3000);
      await clicked;

      // Assert
      expect(opened.navigate).toHaveBeenCalledWith(`${ORIGIN}/settings`);
      expect(worker.openWindow).toHaveBeenCalledWith(`${ORIGIN}/settings`);
    } finally {
      vi.useRealTimers();
    }
  });

  it("앱 창에 메시지를 보내지 못하면 기다리지 않고 그 창을 알림 주소로 옮긴다", async () => {
    // Arrange
    const opened = fakeWindow();
    opened.postMessage = vi.fn(() => {
      throw new DOMException("gone", "InvalidStateError");
    });
    const worker = loadServiceWorker({ windows: [opened] });

    // Act
    await worker.dispatch("notificationclick", clickEvent("/settings"));

    // Assert
    expect(opened.navigate).toHaveBeenCalledWith(`${ORIGIN}/settings`);
    expect(worker.openWindow).not.toHaveBeenCalled();
  });

  it("앱 창에 보내는 주소 메시지 종류는 앱이 기다리는 값과 같다", () => {
    expect(SOURCE).toContain(`const PUSH_OPEN_MESSAGE = "${PUSH_OPEN_MESSAGE}";`);
  });
});
