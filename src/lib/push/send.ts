import type { PushMessage } from "./message";

/** 저장해 둔 기기 구독 하나(`push_subscriptions`의 칸) */
export interface StoredPushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/** 구독 하나에 암호화한 내용을 보낸다. 실패하면 받는 쪽 HTTP 상태(`statusCode`)를 담은 오류를 던진다(web-push의 WebPushError) */
export type SendToSubscription = (subscription: StoredPushSubscription, payload: string) => Promise<unknown>;

export interface SendPushMessageParams {
  subscriptions: readonly StoredPushSubscription[];
  message: PushMessage;
  send: SendToSubscription;
}

export interface PushSendResult {
  sentCount: number;
  /** 알림 서비스가 "이 구독은 없다"(404·410)고 답한 기기. 앱을 지웠거나 알림을 끈 기기라 지운다 */
  expiredEndpoints: string[];
  /** 그 밖의 이유로 보내지 못한 기기 수(알림 서비스 장애, 잘못된 키 등). 구독은 그대로 둔다 */
  failedCount: number;
}

/** 알림 서비스가 구독이 사라졌다고 답하는 상태 코드 */
const EXPIRED_STATUS_CODES = new Set([404, 410]);

const toStatusCode = (reason: unknown): number | undefined =>
  typeof reason === "object" && reason !== null && "statusCode" in reason && typeof reason.statusCode === "number"
    ? reason.statusCode
    : undefined;

/**
 * 같은 알림을 여러 기기에 한꺼번에 보내고, 기기마다 결과를 모은다. 한 기기가 실패해도 나머지에는 보낸다.
 *
 * @example await sendPushMessage({ subscriptions, message: PUSH_TEST_MESSAGE, send: createWebPushSender(vapid) })
 */
export const sendPushMessage = async ({ subscriptions, message, send }: SendPushMessageParams): Promise<PushSendResult> => {
  const payload = JSON.stringify(message);
  const results = await Promise.allSettled(subscriptions.map((subscription) => send(subscription, payload)));

  const expiredEndpoints = results.flatMap((result, index) => {
    if (result.status === "fulfilled") return [];
    const statusCode = toStatusCode(result.reason);
    return statusCode !== undefined && EXPIRED_STATUS_CODES.has(statusCode) ? [subscriptions[index].endpoint] : [];
  });
  const sentCount = results.filter((result) => result.status === "fulfilled").length;

  return { sentCount, expiredEndpoints, failedCount: results.length - sentCount - expiredEndpoints.length };
};
