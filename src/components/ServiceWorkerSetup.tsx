"use client";

import { useEffect } from "react";
import { registerServiceWorker } from "@/lib/pwa/service-worker";

/** 등록돼 있지 않을 때만 등록한다. 등록돼 있으면 브라우저가 화면을 열 때 새 버전을 알아서 확인해, 다시 등록해 `/sw.js`를 또 받지 않는다 */
const registerIfMissing = async (container: ServiceWorkerContainer): Promise<void> => {
  if (await container.getRegistration()) return;
  await registerServiceWorker(container);
};

/**
 * 앱을 열면 서비스 워커(`public/sw.js`)를 등록한다. 화면에 내용을 그리지 않는다.
 * 알림을 켜지 않은 기기도 다음부터 끊긴 채 켤 때 브라우저 오류 화면 대신 안내 화면을 보게 한다(#365).
 * 서비스 워커를 지원하지 않는 브라우저와 개발 서버는 건너뛴다. 개발 서버에서 등록하면 같은 주소로 띄운 다른 프로젝트의 화면 열기까지 맡게 된다.
 *
 * @example <ServiceWorkerSetup />
 */
export const ServiceWorkerSetup = (): null => {
  useEffect(() => {
    if (process.env.NODE_ENV === "development" || !("serviceWorker" in navigator)) return;
    // 등록하지 못해도 앱은 그대로 쓸 수 있다. 끊긴 채 켤 때 지금처럼 브라우저 오류 화면이 나올 뿐이고, 다음에 앱을 열 때 다시 등록한다
    registerIfMissing(navigator.serviceWorker).catch((error: unknown) => {
      console.error(new Error("서비스 워커를 등록하지 못했습니다.", { cause: error }));
    });
  }, []);

  return null;
};
