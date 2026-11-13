import "server-only";
import webpush from "web-push";
import type { SendToSubscription } from "./send";
import { VAPID_SUBJECT, type VapidConfig } from "./vapid";

/** 기기가 꺼져 있을 때 알림 서비스가 보관하는 시간(초). 하루가 지난 알림은 늦게 받아도 쓸모가 적다 */
const PUSH_TTL_SECONDS = 24 * 60 * 60;
/** 알림 서비스가 답하지 않을 때 실패로 보기까지 기다리는 시간(ms). 화면의 요청 제한(10초)보다 짧게 둔다 */
const PUSH_REQUEST_TIMEOUT = 8_000;

/**
 * web-push로 실제 알림 서비스에 보내는 함수를 만든다. 비밀 키를 쓰므로 서버에서만 부른다.
 *
 * @example const send = createWebPushSender(vapid); await send(subscription, JSON.stringify(message));
 */
export const createWebPushSender =
  ({ publicKey, privateKey }: VapidConfig): SendToSubscription =>
  ({ endpoint, p256dh, auth }, payload) =>
    webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, payload, {
      vapidDetails: { subject: VAPID_SUBJECT, publicKey, privateKey },
      TTL: PUSH_TTL_SECONDS,
      timeout: PUSH_REQUEST_TIMEOUT,
    });
