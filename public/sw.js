// Luv3 서비스 워커(#363). 알림을 받아 보여 주고, 알림을 누르면 앱을 연다.
// 화면·파일을 저장하지 않는다(오프라인 캐시 없음, docs/plan.md "홈 화면 웹앱"). 그래서 fetch 처리를 두지 않는다.
// 서버가 보내는 내용의 모양은 src/lib/push/message.ts의 PushMessage다. 테스트: src/lib/push/service-worker.test.ts

const DEFAULT_TITLE = "Luv3";
const HOME_PATH = "/";

// 새 버전이 오면 기다리지 않고 바로 바꾼다. 저장해 둔 화면이 없어 예전 버전과 섞일 것이 없다
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
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
