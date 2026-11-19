/** 알림을 받고 끊긴 채 켤 때 안내 화면을 돌려주는 서비스 워커 파일(`public/sw.js`) */
const SERVICE_WORKER_PATH = "/sw.js";

/** `navigator.serviceWorker` 중 등록에 쓰는 부분. 테스트가 가짜를 넘길 수 있게 좁혀 둔다 */
type ServiceWorkerRegistrar = Pick<ServiceWorkerContainer, "register">;

/**
 * 서비스 워커를 앱 전체 범위로 등록한다. 이미 등록돼 있으면 같은 등록을 돌려준다.
 * 고친 서비스 워커가 바로 퍼지게 HTTP 저장본을 쓰지 않는다(`updateViaCache: "none"`, next.config.ts의 `/sw.js` no-cache와 함께).
 *
 * @example const registration = await registerServiceWorker(navigator.serviceWorker);
 */
export const registerServiceWorker = (container: ServiceWorkerRegistrar): Promise<ServiceWorkerRegistration> =>
  container.register(SERVICE_WORKER_PATH, { scope: "/", updateViaCache: "none" });
