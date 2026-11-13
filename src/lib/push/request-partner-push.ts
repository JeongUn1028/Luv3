import { PUSH_NOTIFY_PATH } from "./message";
import type { PartnerPushBody } from "./partner-push";

/**
 * 저장에 성공한 뒤 상대에게 알림을 부탁한다(#364). 결과를 기다리지 않고, 실패해도 저장 결과·화면에는 영향이 없다.
 * 저장을 마친 자리에서 불러 저장 중 화면을 떠났어도(#104) 부탁이 간다. 알림 열쇠가 없는 환경(알림 기능을 켜기 전)에서는 보내지 않는다.
 * 아이폰 Safari에서 `keepalive` 요청은 서버에 닿지 않아(#374) 시험 알림과 같은 보통 요청으로 보낸다.
 * 그래서 저장 직후 앱을 완전히 닫으면 그 알림 하나가 빠질 수 있다(#29 "정한 것" 6번에서 받아들인 범위).
 *
 * @example requestPartnerPush({ kind: "comment", id: comment.id });
 */
export const requestPartnerPush = (body: PartnerPushBody, fetcher: typeof fetch = fetch): void => {
  if (!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) return;
  fetcher(PUSH_NOTIFY_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch((error: unknown) => {
    console.error(new Error("상대에게 알림을 부탁하지 못했습니다.", { cause: error }));
  });
};
