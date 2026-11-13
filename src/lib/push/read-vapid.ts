import { getVapidConfig, type VapidConfig } from "./vapid";

/**
 * 서버 경로에서 알림 열쇠를 읽는다. 하나만 넣은 설정 실수는 원인을 로그에 남기고 "설정 없음"과 같이 다룬다.
 *
 * @example const vapid = readVapidConfig("시험 알림"); if (!vapid) return toErrorResponse("PUSH_NOT_CONFIGURED", ..., 503);
 */
export const readVapidConfig = (logLabel: string): VapidConfig | undefined => {
  try {
    return getVapidConfig();
  } catch (error) {
    console.error(`${logLabel}: 알림 열쇠 설정이 잘못됐습니다`, error instanceof Error ? error.message : String(error));
    return undefined;
  }
};
