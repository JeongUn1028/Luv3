// 이 기기(브라우저)의 알림 구독 다루기. 설정 화면 알림 칸(#363), 로그아웃(#364), 로그인(#409)이 함께 쓴다

import { createClient } from "@/lib/supabase/client";
import { isUsableSubscription, toApplicationServerKey, toStoredSubscription } from "./subscription";

/** 로그인한 뒤 구독 주인을 맞추기를 기다리는 시간(ms). 신호가 약해도 로그인한 화면으로 옮기는 것을 오래 막지 않는다 */
const ADOPT_TIMEOUT = 3_000;

/**
 * 이 기기의 구독을 로그인한 사람 것으로 저장한다. 같은 기기를 다른 사람이 쓰던 행이면 주인을 바꾼다(`save_push_subscription`).
 *
 * @example await savePushSubscriptionRow(subscription);
 */
export const savePushSubscriptionRow = async (subscription: PushSubscription): Promise<void> => {
  const { endpoint, p256dh, auth } = toStoredSubscription(subscription.toJSON());
  const { error } = await createClient().rpc("save_push_subscription", { p_endpoint: endpoint, p_p256dh: p256dh, p_auth: auth });
  if (error) throw new Error(`알림 구독을 저장하지 못했습니다: ${error.message}`, { cause: error });
};

/**
 * 서버에 저장한 이 기기의 구독 행을 지운다. 각자 자기 행만 지울 수 있다(RLS).
 *
 * @example await deletePushSubscriptionRow(subscription.endpoint);
 */
export const deletePushSubscriptionRow = async (endpoint: string): Promise<void> => {
  const { error } = await createClient().from("push_subscriptions").delete().eq("endpoint", endpoint);
  if (error) throw new Error(`알림 구독을 지우지 못했습니다: ${error.message}`, { cause: error });
};

/**
 * 이 기기(브라우저)의 알림 구독. 알림을 켠 적이 없거나 알림 API가 없는 브라우저면 `undefined`.
 * 로그아웃(#364)이 구독 주소를 로그아웃 요청에 담고, 로그아웃이 끝나면 이 구독을 끊는다.
 *
 * @example const subscription = await getThisDevicePushSubscription();
 */
export const getThisDevicePushSubscription = async (): Promise<PushSubscription | undefined> => {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return undefined;
  const registration = await navigator.serviceWorker.getRegistration();
  return (await registration?.pushManager.getSubscription()) ?? undefined;
};

const adoptIfUsable = async (publicKey: string): Promise<void> => {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const subscription = await getThisDevicePushSubscription();
  // 알림 열쇠를 바꾸기 전의 구독으로는 보낼 수 없다. 설정 화면에서 다시 켤 때 새로 만든다
  if (!subscription || !isUsableSubscription(subscription, toApplicationServerKey(publicKey))) return;
  await savePushSubscriptionRow(subscription);
};

/**
 * 로그인한 뒤 이 기기에 알림 구독이 있으면 지금 로그인한 사람 것으로 맞춘다(#409).
 * 세션이 끊긴 뒤 로그아웃 없이 다른 사람이 로그인하면, 설정 화면을 열기 전까지 상대 알림이 앞 사람 기준으로 이 기기에 왔다.
 * 실패하거나 오래 걸려도 로그인은 그대로 이어 가도록 던지지 않고 정한 시간까지만 기다린다.
 *
 * @example await adoptThisDevicePushSubscription(); window.location.assign(nextPath);
 */
export const adoptThisDevicePushSubscription = async (): Promise<void> => {
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!publicKey) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ADOPT_TIMEOUT);
  });
  await Promise.race([adoptIfUsable(publicKey), timeout])
    .catch((error: unknown) => console.error(new Error("이 기기의 알림 구독을 맞추지 못했습니다.", { cause: error })))
    .finally(() => clearTimeout(timer));
};
