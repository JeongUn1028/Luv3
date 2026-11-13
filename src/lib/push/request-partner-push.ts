import { PUSH_NOTIFY_PATH } from "./message";
import type { PartnerPushBody } from "./partner-push";

/**
 * 저장에 성공한 뒤 상대에게 알림을 부탁한다(#364). 결과를 기다리지 않고, 실패해도 저장 결과·화면에는 영향이 없다.
 * 저장을 마친 자리에서 불러 저장 중 화면을 떠났어도(#104) 부탁이 가고, 앱을 닫는 중에도 요청이 끝까지 가게 keepalive로 보낸다.
 * 알림 열쇠가 없는 환경(알림 기능을 켜기 전)에서는 보내지 않는다.
 *
 * @example requestPartnerPush({ kind: "comment", id: comment.id });
 */
export const requestPartnerPush = (body: PartnerPushBody): void => {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
  fetch(PUSH_NOTIFY_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch((error: unknown) => {
    console.error(new Error("상대에게 알림을 부탁하지 못했습니다.", { cause: error }));
  });
};
