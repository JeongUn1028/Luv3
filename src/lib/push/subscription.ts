// 설정 화면 알림 칸(#363)이 쓰는 판단과 변환. 브라우저 API를 직접 부르지 않아 단위 테스트로 확인한다

import type { StoredPushSubscription } from "./send";

/** 이 브라우저에서 알림을 켤 수 있는지 */
export type PushSupport = "supported" | "needs-install" | "unsupported";

/** 설정 화면 알림 칸이 보여 줄 상태 */
export type PushStatus = "checking" | "unsupported" | "needs-install" | "denied" | "off" | "on";

export interface ToPushSupportParams {
  /** `serviceWorker`·`PushManager`·`Notification`이 모두 있는지 */
  hasPushApi: boolean;
  isIos: boolean;
  /** 홈 화면에 추가한 앱으로 열었는지(`display-mode: standalone`) */
  isStandalone: boolean;
}

/**
 * 알림을 켤 수 있는지 판단한다. 아이폰은 홈 화면에 추가한 앱에서만 알림 API가 생겨, Safari에서 열었으면 추가하라고 안내한다.
 *
 * @example toPushSupport({ hasPushApi: false, isIos: true, isStandalone: false }) // "needs-install"
 */
export const toPushSupport = ({ hasPushApi, isIos, isStandalone }: ToPushSupportParams): PushSupport => {
  if (hasPushApi) return "supported";
  return isIos && !isStandalone ? "needs-install" : "unsupported";
};

export interface IsIosDeviceParams {
  userAgent: string;
  maxTouchPoints: number;
}

/**
 * 아이폰·아이패드인지 본다. 아이패드 Safari는 데스크톱 맥처럼 자신을 알리므로 터치 지점 수로 가른다.
 *
 * @example isIosDevice({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints })
 */
export const isIosDevice = ({ userAgent, maxTouchPoints }: IsIosDeviceParams): boolean =>
  /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);

export interface ToPushStatusParams {
  support: PushSupport;
  permission: NotificationPermission;
  hasSubscription: boolean;
}

/**
 * 지원 여부·알림 허락·이 기기의 구독으로 알림 칸 상태를 정한다. 허락했어도 구독이 없으면(앱을 다시 설치 등) 다시 켜게 한다.
 *
 * @example toPushStatus({ support: "supported", permission: "granted", hasSubscription: true }) // "on"
 */
export const toPushStatus = ({ support, permission, hasSubscription }: ToPushStatusParams): PushStatus => {
  if (support !== "supported") return support;
  if (permission === "denied") return "denied";
  return permission === "granted" && hasSubscription ? "on" : "off";
};

/**
 * base64url로 적힌 알림 공개 키를 브라우저 구독(`applicationServerKey`)이 받는 바이트로 바꾼다.
 *
 * @example registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toApplicationServerKey(publicKey) })
 */
export const toApplicationServerKey = (base64Url: string): Uint8Array<ArrayBuffer> => {
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(base64Url.length / 4) * 4, "=");
  const binary = atob(base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

/**
 * 이미 있는 구독이 지금 공개 키로 만든 것인지 본다. 키를 바꾼 뒤의 예전 구독으로는 보낼 수 없어 새로 구독해야 한다.
 *
 * @example isSameServerKey(subscription.options.applicationServerKey, toApplicationServerKey(publicKey))
 */
export const isSameServerKey = (current: ArrayBuffer | null, expected: Uint8Array): boolean => {
  if (!current) return false;
  const bytes = new Uint8Array(current);
  return bytes.length === expected.length && bytes.every((byte, index) => byte === expected[index]);
};

/**
 * 브라우저 구독(`PushSubscription.toJSON()`)에서 저장할 칸을 꺼낸다. 키가 빠져 있으면 보낼 수 없어 멈춘다.
 *
 * @example const { endpoint, p256dh, auth } = toStoredSubscription(subscription.toJSON());
 */
export const toStoredSubscription = ({ endpoint, keys }: PushSubscriptionJSON): StoredPushSubscription => {
  const p256dh = keys?.p256dh;
  const auth = keys?.auth;
  if (!endpoint || !p256dh || !auth) throw new Error("브라우저가 알림 구독 정보를 주지 않았습니다.");
  return { endpoint, p256dh, auth };
};
