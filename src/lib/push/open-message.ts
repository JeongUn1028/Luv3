import { getSafeNextPath } from "@/lib/auth/paths";
import { isObject } from "@/lib/guards";
import { PUSH_OPEN_MESSAGE } from "./message";

/**
 * 서비스 워커가 보낸 "이 주소를 열어 달라" 메시지(#406)에서 앱 안 경로를 꺼낸다. 다른 메시지·다른 사이트 주소면 undefined.
 * 서비스 워커가 이미 앱 안 주소로 바꿔 보내지만, 앱 라우터로 옮기기 전에 한 번 더 확인한다.
 * 같은 사이트로 읽혀도 정리하면 다른 사이트가 되는 경로(`/.//evil.com`)와 로그인 화면은 홈으로 바꾼다(`getSafeNextPath`).
 *
 * @example readPushOpenPath(event.data, window.location.origin) // "/dates/1"
 */
export const readPushOpenPath = (data: unknown, origin: string): string | undefined => {
  if (!isObject(data) || data.type !== PUSH_OPEN_MESSAGE || typeof data.url !== "string") return undefined;
  try {
    const url = new URL(data.url);
    return url.origin === origin ? getSafeNextPath(`${url.pathname}${url.search}${url.hash}`) : undefined;
  } catch {
    return undefined;
  }
};
