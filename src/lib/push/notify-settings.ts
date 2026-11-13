// 설정 화면의 종류별 알림 스위치(#364, 시안 4번 A). 설정 화면(서버 조회)과 스위치(브라우저)가 함께 쓴다

import type { PartnerPushKind } from "./partner-push";

/** 종류마다 알림을 받을지. 사람마다 하나라 휴대폰을 바꿔도 그대로다 */
export type PushNotifySettings = Record<PartnerPushKind, boolean>;

/** `push_settings`에서 읽는 칸 */
export interface PushNotifyRow {
  notify_record: boolean;
  notify_comment: boolean;
  notify_event: boolean;
}

/** 설정 화면에 그리는 스위치와 순서 */
export const PUSH_NOTIFY_SWITCHES: readonly { kind: PartnerPushKind; label: string }[] = [
  { kind: "record", label: "새 기록" },
  { kind: "comment", label: "댓글" },
  { kind: "event", label: "새 일정" },
];

/**
 * 설정 행을 스위치 값으로 바꾼다. 바꾼 적이 없어 행이 없으면 모두 켠 것이다(DB의 claim_partner_push와 같은 규칙).
 *
 * @example const settings = toPushNotifySettings(data ?? undefined);
 */
export const toPushNotifySettings = (row: PushNotifyRow | undefined): PushNotifySettings =>
  row ? { record: row.notify_record, comment: row.notify_comment, event: row.notify_event } : { record: true, comment: true, event: true };
