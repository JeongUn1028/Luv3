// 이 기기(브라우저)의 알림 구독 다루기. 설정 화면 알림 칸(#363)과 로그아웃(#364)이 함께 쓴다

import { createClient } from "@/lib/supabase/client";

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
