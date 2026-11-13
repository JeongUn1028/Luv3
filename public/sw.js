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
    };
  } catch {
    return { title: DEFAULT_TITLE, body: "", url: HOME_PATH };
  }
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
  const { title, body, url } = readMessage(event.data);
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      data: { url },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = toAppUrl(event.notification.data && event.notification.data.url);
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windows) => {
      // 이미 열린 앱이 있으면 새 창을 띄우지 않고 그 창을 앞으로 가져와 옮긴다.
      // 이 서비스 워커가 맡지 않은 창은 옮길 수 없어(navigate 거절) 그때는 새로 연다
      const opened = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (!opened) return self.clients.openWindow(target);
      return opened
        .focus()
        .then((client) => client.navigate(target))
        .catch(() => self.clients.openWindow(target));
    }),
  );
});
