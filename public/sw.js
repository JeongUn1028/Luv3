// Luv3 서비스 워커(#363). 알림을 받아 보여 주고, 알림을 누르면 앱을 연다.
// 앱 화면은 저장하지 않는다(오프라인 캐시 없음, docs/plan.md "홈 화면 웹앱"). 저장하는 것은 끊긴 채 켤 때의 안내 화면 한 장뿐이다(#365).
// 서버가 보내는 내용의 모양은 src/lib/push/message.ts의 PushMessage다. 테스트: src/lib/push/service-worker.test.ts

const DEFAULT_TITLE = "Luv3";
const HOME_PATH = "/";

// 끊긴 채 앱을 켜거나 새로 고칠 때 브라우저 오류 화면 대신 보여 줄 안내 화면(#365). 다른 파일을 부르지 않는 한 장짜리 HTML이다
const OFFLINE_PAGE_PATH = "/offline.html";
const OFFLINE_CACHE = "luv3-offline";
// 안내 화면 내용의 SHA-256 앞 8글자. 안내 화면을 고치면 이 값이 바뀌어 이 파일도 바뀌므로, 브라우저가 새 서비스 워커를 설치하며
// 새 안내 화면을 받아 같은 자리에 덮어쓴다. 새로 받지 못하면 예전 안내 화면이 그대로 남는다. 값이 내용과 다르면 테스트가 실패한다
const OFFLINE_PAGE_VERSION = "49bef79f";
// 안내 화면을 받는 데 기다리는 시간. 설치가 이것을 기다리므로, 알림 켜기가 서비스 워커를 기다리는 시간(10초)보다 짧게 둔다
const OFFLINE_PAGE_TIMEOUT_MS = 5000;

// 이 서비스 워커가 깨어 있는 동안 안내 화면을 저장했는지. 화면을 열 때마다 저장소를 다시 들여다보지 않게 한다
let isOfflinePageSaved = false;

/** 정한 시간이 지나면 요청을 끊는 신호. 지원하지 않는 브라우저는 끊지 않는다 */
const timeoutSignal = () => (typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(OFFLINE_PAGE_TIMEOUT_MS) : undefined);

/** 안내 화면을 서버에서 새로 받아(브라우저 HTTP 저장본을 거치지 않고) 저장한다 */
const saveOfflinePage = async () => {
  const response = await fetch(new Request(`${OFFLINE_PAGE_PATH}?v=${OFFLINE_PAGE_VERSION}`, { cache: "reload", signal: timeoutSignal() }));
  if (!response.ok) throw new Error(`안내 화면을 받지 못했습니다: ${response.status}`);
  const cache = await self.caches.open(OFFLINE_CACHE);
  await cache.put(OFFLINE_PAGE_PATH, response);
  isOfflinePageSaved = true;
};

/** 저장해 둔 안내 화면이 없으면 저장한다. 설치할 때 받지 못한 경우(끊긴 채 설치 등)를 다음 화면 열기에서 채운다 */
const ensureOfflinePage = async () => {
  if (isOfflinePageSaved) return;
  const cache = await self.caches.open(OFFLINE_CACHE);
  if (await cache.match(OFFLINE_PAGE_PATH)) {
    isOfflinePageSaved = true;
    return;
  }
  await saveOfflinePage();
};

// 새 버전이 오면 기다리지 않고 바로 바꾼다. 저장하는 것은 안내 화면뿐이라 예전 버전 화면과 섞일 것이 없다.
// 안내 화면을 받지 못해도 설치는 마친다. 설치가 실패하거나 멈추면 알림도 받지 못한다
self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(saveOfflinePage().catch(() => undefined));
});

// 화면 요청이 서비스 워커를 거치는 동안 서버 요청을 함께 시작해, 서비스 워커가 깨어나는 시간만큼 늦어지지 않게 한다
const enableNavigationPreload = async () => {
  const preload = self.registration.navigationPreload;
  if (preload) await preload.enable();
};

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([self.clients.claim(), enableNavigationPreload().catch(() => undefined)]));
});

/**
 * 화면 열기(navigation)는 서버 응답을 그대로 돌려주고, 연결 자체가 실패할 때만 저장해 둔 안내 화면을 돌려준다.
 * 서버 오류(500 등)는 그대로 둔다. 안내 화면이 없으면 지금처럼 브라우저 오류 화면이 나온다
 */
const openPage = async (event) => {
  try {
    const preloaded = await event.preloadResponse;
    return preloaded || (await fetch(event.request));
  } catch {
    const offlinePage = await self.caches.match(OFFLINE_PAGE_PATH, { cacheName: OFFLINE_CACHE });
    return offlinePage || Response.error();
  }
};

// 화면 열기만 맡는다. 데이터·파일·화면 조각 요청과 Next의 연결 확인(HEAD)에는 끼어들지 않는다
self.addEventListener("fetch", (event) => {
  if (event.request.mode !== "navigate" || event.request.method !== "GET") return;
  event.respondWith(openPage(event));
  event.waitUntil(ensureOfflinePage().catch(() => undefined));
});

/** 받은 내용을 읽는다. 모양이 다르거나 비어 있어도 알림은 꼭 보여 준다(아이폰은 알림 없이 받기만 하면 구독을 끊는다) */
const readMessage = (data) => {
  try {
    const message = data ? data.json() : {};
    return {
      title: typeof message.title === "string" && message.title ? message.title : DEFAULT_TITLE,
      body: typeof message.body === "string" ? message.body : "",
      url: typeof message.url === "string" ? message.url : HOME_PATH,
      badge: Number.isInteger(message.badge) && message.badge >= 0 ? message.badge : undefined,
    };
  } catch {
    return { title: DEFAULT_TITLE, body: "", url: HOME_PATH, badge: undefined };
  }
};

// 앱을 보고 있는 동안 알림이 오면 앱 창에 보내는 메시지. src/lib/push/message.ts의 PUSH_RECEIVED_MESSAGE와 같다
const PUSH_RECEIVED_MESSAGE = "luv3:push-received";

/**
 * 앱 아이콘 숫자를 바꾼다(#364). 숫자는 서버가 세어 알림에 담는다(앱을 연 뒤 받은 알림 수).
 * 앱을 보고 있으면 받은 알림을 이미 본 셈이라 숫자를 띄우지 않고, 앱 창에 알려 서버 숫자를 지우게 한다.
 * 숫자를 지원하지 않는 브라우저와 숫자가 없는 알림은 조용히 건너뛴다
 */
const updateBadge = async (badge) => {
  if (badge === undefined) return;
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const shown = windows.filter((client) => client.visibilityState === "visible");
  if (shown.length > 0) {
    shown.forEach((client) => client.postMessage({ type: PUSH_RECEIVED_MESSAGE }));
    return;
  }
  const { navigator } = self;
  if (!navigator || typeof navigator.setAppBadge !== "function") return;
  await navigator.setAppBadge(badge);
};

/**
 * 앱 안 경로만 연다. 다른 사이트 주소가 오면 홈으로 바꾼다.
 * 글자로 앞부분만 보면 `/<탭>/evil.example`처럼 URL 해석이 지우는 글자로 빠져나갈 수 있어, 해석한 결과의 출처로 확인한다
 */
const toAppUrl = (path) => {
  const home = new URL(HOME_PATH, self.location.origin).href;
  if (typeof path !== "string" || !path.startsWith("/")) return home;
  try {
    const url = new URL(path, self.location.origin);
    return url.origin === self.location.origin ? url.href : home;
  } catch {
    return home;
  }
};

self.addEventListener("push", (event) => {
  const { title, body, url, badge } = readMessage(event.data);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(title, {
        body,
        icon: "/icon-192.png",
        data: { url },
      }),
      // 숫자를 바꾸지 못해도 알림은 보인다
      updateBadge(badge).catch(() => undefined),
    ]),
  );
});

// 열린 앱 창에 연 주소를 넘기는 메시지 종류(#406). src/lib/push/message.ts의 PUSH_OPEN_MESSAGE와 같다
const PUSH_OPEN_MESSAGE = "luv3:open-url";
// 앱이 받았다고 답하기를 기다리는 시간. 숨겨졌던 앱이 앞으로 나와 다시 움직이기까지 걸리는 때를 넉넉히 둔다
const OPEN_REPLY_TIMEOUT_MS = 3000;

/**
 * 앱 창에 주소를 넘기고, 앱이 받았다고 답하면 true. 정해진 시간 안에 답이 없으면 false.
 * 알림을 받기 전에 열어 둔 예전 버전 앱은 메시지를 듣지 않아 답하지 않는다
 */
const askAppToOpen = (client, url) =>
  new Promise((resolve) => {
    const channel = new MessageChannel();
    const finish = (isOpened) => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(isOpened);
    };
    const timer = setTimeout(() => finish(false), OPEN_REPLY_TIMEOUT_MS);
    channel.port1.onmessage = (event) => finish(Boolean(event.data && event.data.type === PUSH_OPEN_MESSAGE));
    try {
      client.postMessage({ type: PUSH_OPEN_MESSAGE, url }, [channel.port2]);
    } catch {
      // 보내지 못하면 답도 오지 않으니 기다리지 않는다
      finish(false);
    }
  });

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = toAppUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const opened = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (!opened) return self.clients.openWindow(target);
      try {
        // 이미 열린 앱이 있으면 새 창을 띄우지 않고 그 창을 앞으로 가져와, 앱이 스스로 옮기게 한다.
        // 창을 통째로 옮기면 쓰던 글·고른 사진이 사라지지만, 앱 안 이동은 쓰던 폼을 숨겨 둔 채 남긴다
        const client = await opened.focus();
        if (await askAppToOpen(client, target)) return undefined;
        // 답하지 않는 앱은 창을 옮긴다. 이 서비스 워커가 맡지 않은 창은 옮길 수 없어(navigate 거절) 그때는 새로 연다
        return await client.navigate(target);
      } catch {
        return self.clients.openWindow(target);
      }
    }),
  );
});
