// 상대 활동 알림(#364). 저장한 휴대폰이 보내는 부탁, DB(claim_partner_push)의 답, 알림 문구를 다룬다.
// 서버 경로(/api/push/notify)와 저장하는 화면이 함께 쓴다
// 알림 문구는 잠금 화면에 그대로 보이므로 글 내용(제목·댓글·날짜)은 보이지 않게 누가 무엇을 했는지만 제목 한 줄로 알리고
// 본문은 비운다(사용자 결정). 무엇을 봐야 하는지는 누르면 열리는 화면이 보여 준다

import { toCalendarHref } from "@/lib/calendar/month";
import { COMMENTS_HEADING_ID } from "@/lib/comments/comment";
import { isRecordId, toRecordHref } from "@/lib/dates/detail";
import { isObject } from "@/lib/guards";
import type { PushMessage } from "./message";
import type { StoredPushSubscription } from "./send";

/** 알림을 보내는 일: 새 기록, 댓글, 새 일정(#29 "정한 것" 2번) */
export type PartnerPushKind = "record" | "comment" | "event";

const PARTNER_PUSH_KINDS: readonly string[] = ["record", "comment", "event"] satisfies PartnerPushKind[];

/** 저장한 휴대폰이 보내는 부탁. 알림 문구는 서버가 DB에서 다시 읽어 만들므로 종류와 글 id만 보낸다 */
export interface PartnerPushBody {
  kind: PartnerPushKind;
  id: string;
}

const isPartnerPushKind = (value: unknown): value is PartnerPushKind => typeof value === "string" && PARTNER_PUSH_KINDS.includes(value);

/**
 * 알림 부탁 본문을 읽는다. 종류를 모르거나 id가 uuid가 아니면 `undefined`.
 *
 * @example const body = parsePartnerPushBody(await request.json().catch(() => undefined));
 */
export const parsePartnerPushBody = (value: unknown): PartnerPushBody | undefined => {
  if (!isObject(value) || !isPartnerPushKind(value.kind) || typeof value.id !== "string") return undefined;
  // 기록·댓글·일정 id는 모두 uuid다(isRecordId가 uuid 모양을 본다)
  return isRecordId(value.id) ? { kind: value.kind, id: value.id } : undefined;
};

/** 받는 사람 한 명. `badge`는 이 알림을 더한 앱 아이콘 숫자다 */
export interface PartnerPushRecipient {
  badge: number;
  subscriptions: StoredPushSubscription[];
}

/** DB가 알림을 보내지 않기로 한 이유. 마이그레이션 partner_push의 claim_partner_push와 같아야 한다 */
export type PartnerPushRefusal = "not-found" | "not-author" | "not-new" | "too-old" | "already-sent";

const REFUSALS: readonly string[] = ["not-found", "not-author", "not-new", "too-old", "already-sent"] satisfies PartnerPushRefusal[];

export type PartnerPushClaim = { status: "ready"; recipients: PartnerPushRecipient[] } | { status: PartnerPushRefusal };

const isRefusal = (value: string): value is PartnerPushRefusal => REFUSALS.includes(value);

const toSubscription = (value: unknown): StoredPushSubscription | undefined =>
  isObject(value) && typeof value.endpoint === "string" && typeof value.p256dh === "string" && typeof value.auth === "string"
    ? { endpoint: value.endpoint, p256dh: value.p256dh, auth: value.auth }
    : undefined;

const toRecipient = (value: unknown): PartnerPushRecipient | undefined => {
  if (!isObject(value) || typeof value.badge !== "number" || !Array.isArray(value.subscriptions)) return undefined;
  const subscriptions = value.subscriptions.map(toSubscription);
  return subscriptions.every((subscription) => subscription !== undefined) ? { badge: value.badge, subscriptions } : undefined;
};

/**
 * `claim_partner_push`의 답(jsonb)을 읽는다. 모양이 다르면 `undefined`.
 *
 * @example const claim = parsePartnerPushClaim(data); if (claim?.status === "ready") ...
 */
export const parsePartnerPushClaim = (value: unknown): PartnerPushClaim | undefined => {
  if (!isObject(value) || typeof value.status !== "string") return undefined;
  if (value.status !== "ready") return isRefusal(value.status) ? { status: value.status } : undefined;
  if (!Array.isArray(value.recipients)) return undefined;
  const recipients = value.recipients.map(toRecipient);
  return recipients.every((recipient) => recipient !== undefined) ? { status: "ready", recipients } : undefined;
};

export interface RecordPushParams {
  /** 기록을 남긴 사람 */
  nickname: string;
  recordId: string;
}

/**
 * 새 기록 알림. 누르면 기록 상세를 연다.
 *
 * @example toRecordPushMessage({ nickname: "진아", recordId })
 * // { title: "진아님이 기록을 남겼어요", body: "", url: "/dates/<id>" }
 */
export const toRecordPushMessage = ({ nickname, recordId }: RecordPushParams): PushMessage => ({
  title: `${nickname}님이 기록을 남겼어요`,
  body: "",
  url: toRecordHref(recordId),
});

export interface CommentPushParams {
  nickname: string;
  /** 댓글을 남긴 기록 */
  recordId: string;
}

/**
 * 댓글 알림. 누르면 그 기록 상세의 댓글로 간다.
 *
 * @example toCommentPushMessage({ nickname: "진아", recordId })
 * // { title: "진아님이 댓글을 남겼어요", body: "", url: "/dates/<id>#record-comments" }
 */
export const toCommentPushMessage = ({ nickname, recordId }: CommentPushParams): PushMessage => ({
  title: `${nickname}님이 댓글을 남겼어요`,
  body: "",
  url: `${toRecordHref(recordId)}#${COMMENTS_HEADING_ID}`,
});

export interface EventPushParams {
  nickname: string;
  /** 일정 날짜. 반복 일정은 첫날이다 */
  date: string;
}

/**
 * 새 일정 알림. 누르면 캘린더의 그 날을 연다.
 *
 * @example toEventPushMessage({ nickname: "진아", date: "2026-11-20" })
 * // { title: "진아님이 일정을 추가했어요", body: "", url: "/calendar?month=2026-11&date=2026-11-20" }
 */
export const toEventPushMessage = ({ nickname, date }: EventPushParams): PushMessage => ({
  title: `${nickname}님이 일정을 추가했어요`,
  body: "",
  url: toCalendarHref({ date }),
});
