/** 알림 서버(VAPID) 열쇠. 공개 키는 브라우저도 알고, 비밀 키는 서버만 안다 */
export interface VapidConfig {
  publicKey: string;
  privateKey: string;
}

interface RawVapidEnv {
  publicKey: string | undefined;
  privateKey: string | undefined;
}

/**
 * 알림 서비스(애플·구글)가 문제가 생기면 연락할 곳. 애플은 https 주소나 mailto만 받고 localhost 주소는 거절해,
 * 로컬에서 보내도 운영 주소를 쓴다(docs/plan.md "도메인").
 */
export const VAPID_SUBJECT = "https://luv3.vercel.app";

/**
 * 알림 열쇠 환경 변수를 검증한다. 둘 다 없으면 알림 기능을 끈 것으로 보고 `undefined`를 돌려준다
 * (카카오 지도 키처럼, 키를 넣기 전에는 설정 화면에 알림 칸이 나오지 않는다). 하나만 있으면 잘못 넣은 것이라 멈춘다.
 *
 * @example parseVapidEnv({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY })
 */
export const parseVapidEnv = ({ publicKey, privateKey }: RawVapidEnv): VapidConfig | undefined => {
  if (!publicKey && !privateKey) return undefined;
  if (!publicKey || !privateKey) {
    const missing = publicKey ? "VAPID_PRIVATE_KEY" : "NEXT_PUBLIC_VAPID_PUBLIC_KEY";
    throw new Error(`환경 변수가 없습니다: ${missing} (알림 열쇠는 두 값을 함께 넣습니다, .env.example 참고)`);
  }
  return { publicKey, privateKey };
};

/**
 * 서버에서 알림 열쇠를 읽는다. 비밀 키는 `NEXT_PUBLIC_`이 없어 브라우저 번들에 들어가지 않는다.
 *
 * @example const vapid = getVapidConfig(); if (!vapid) return toErrorResponse("PUSH_NOT_CONFIGURED", ..., 503);
 */
export const getVapidConfig = (): VapidConfig | undefined =>
  parseVapidEnv({ publicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY });
