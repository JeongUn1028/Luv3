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
  /** 이 브라우저의 구독 주소가 알림 서비스 목록 밖이라고 확인했는지(#432) */
  isServiceUnsupported: boolean;
}

/**
 * 지원 여부·알림 허락·이 기기의 구독으로 알림 칸 상태를 정한다. 허락했어도 구독이 없으면(앱을 다시 설치 등) 다시 켜게 한다.
 *
 * 알림 서비스 목록 밖 브라우저는 알림 API가 있어도 받을 수 없어 허락 상태와 상관없이 켤 수 없다고 보여 준다.
 *
 * @example toPushStatus({ support: "supported", permission: "granted", hasSubscription: true, isServiceUnsupported: false }) // "on"
 */
export const toPushStatus = ({ support, permission, hasSubscription, isServiceUnsupported }: ToPushStatusParams): PushStatus => {
  if (support !== "supported") return support;
  if (isServiceUnsupported) return "unsupported";
  if (permission === "denied") return "denied";
  return permission === "granted" && hasSubscription ? "on" : "off";
};

/**
 * 구독 주소로 받는 알림 서비스(애플·구글·모질라). DB의 `push_subscriptions_endpoint_service` 제약과 같은 목록이다.
 * 그 밖의 브라우저(예: Windows Edge의 `*.notify.windows.com`)는 구독은 만들어지지만 저장할 수 없다(#412, #432).
 */
export const PUSH_SERVICE_HOSTS = ["web.push.apple.com", "fcm.googleapis.com", "updates.push.services.mozilla.com"] as const;

// DB 제약과 같은 모양으로 맞춘다: https, 호스트 이름 전체가 같고 바로 경로가 온다(포트·다른 이름을 덧붙인 주소는 막는다)
const PUSH_SERVICE_ENDPOINT_PATTERN = new RegExp(`^https://(${PUSH_SERVICE_HOSTS.map((host) => host.replaceAll(".", String.raw`\.`)).join("|")})/`);

/**
 * 구독 주소가 알림 서비스 목록 안인지 본다. 목록 밖이면 서버가 저장을 거절해 알림을 보낼 수 없다.
 *
 * @example if (!isPushServiceEndpoint(subscription.endpoint)) await subscription.unsubscribe();
 */
export const isPushServiceEndpoint = (endpoint: string): boolean => PUSH_SERVICE_ENDPOINT_PATTERN.test(endpoint);

/** 이 브라우저가 알림 서비스 목록 밖이라고 기억해 두는 `localStorage` 키. 구독을 끊은 뒤 다시 열어도 같은 안내를 보인다(#432) */
export const PUSH_SERVICE_UNSUPPORTED_KEY = "luv3-push-service-unsupported";

/**
 * 거절한 구독 주소에서 기억해 둘 값(알림 서비스의 출처)을 만든다. 구독 주소 전체는 보낼 권한이 담긴 값이라 남기지 않는다.
 *
 * @example localStorage.setItem(PUSH_SERVICE_UNSUPPORTED_KEY, toUnsupportedServiceMemory(subscription.endpoint));
 */
export const toUnsupportedServiceMemory = (endpoint: string): string => (URL.canParse(endpoint) ? `${new URL(endpoint).origin}/` : "unknown");

/**
 * 기억해 둔 알림 서비스가 지금 목록에서도 밖인지 본다. 목록에 그 서비스를 더하면 기억이 저절로 풀려 다시 켤 수 있다.
 *
 * @example isRememberedServiceUnsupported(localStorage.getItem(PUSH_SERVICE_UNSUPPORTED_KEY))
 */
export const isRememberedServiceUnsupported = (memory: string | null): boolean => memory !== null && !isPushServiceEndpoint(memory);

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
 * 이 기기에 지금 공개 키로 만든 구독이 있는지 본다. 설정 화면의 확인·켜기와 로그인 뒤 주인 맞추기(#409)가 같은 기준을 쓴다.
 *
 * @example if (isUsableSubscription(subscription, toApplicationServerKey(publicKey))) await savePushSubscriptionRow(subscription)
 */
export const isUsableSubscription = (
  subscription: { options: { applicationServerKey: ArrayBuffer | null } } | null | undefined,
  serverKey: Uint8Array,
): boolean => subscription !== null && subscription !== undefined && isSameServerKey(subscription.options.applicationServerKey, serverKey);

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
