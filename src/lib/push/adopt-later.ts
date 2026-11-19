/** 로그인한 뒤 구독 주인을 맞추기를 기다리는 시간(ms). 신호가 약해도 로그인한 화면으로 옮기는 것을 오래 막지 않는다 */
export const ADOPT_TIMEOUT = 3_000;

/**
 * 이 기기 알림 구독의 주인을 맞추는 일(`adoptThisDevicePushSubscription`, #409)을 쓸 때 불러와 한다.
 * 그 모듈은 Supabase 클라이언트를 바로 불러와, 로그인 화면과 공통 틀의 첫 묶음에 실리지 않게 한다(#457).
 * 원래 함수처럼 실패해도 던지지 않고, 파일을 받는 시간까지 `ADOPT_TIMEOUT` 안에서만 기다려 로그인은 그대로 이어 간다.
 * 알림 열쇠가 없는 환경(알림 기능을 켜기 전)에서는 받지 않는다.
 *
 * @example await adoptThisDevicePushSubscriptionLater(); window.location.assign(nextPath);
 */
export const adoptThisDevicePushSubscriptionLater = async (): Promise<void> => {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, ADOPT_TIMEOUT);
  });
  const adopt = async () => {
    const { adoptThisDevicePushSubscription } = await import("./device-subscription");
    await adoptThisDevicePushSubscription();
  };
  await Promise.race([adopt(), timeout])
    .catch((error: unknown) => console.error(new Error("이 기기의 알림 구독을 맞추지 못했습니다.", { cause: error })))
    .finally(() => clearTimeout(timer));
};
