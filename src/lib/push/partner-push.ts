// 상대 활동 알림(#364). 저장한 휴대폰이 보내는 부탁, DB(claim_partner_push)의 답, 알림 문구를 다룬다.
// 서버 경로(/api/push/notify)와 저장하는 화면이 함께 쓴다

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

/** 댓글 알림 본문에 보여 줄 글자 수(#29 시안 2번) */
const COMMENT_PREVIEW_LENGTH = 50;

// 날짜만 있는 값이라 시간대 영향을 받지 않게 UTC로 읽는다
const MONTH_DAY_FORMAT = new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", timeZone: "UTC" });
const WEEKDAY_FORMAT = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" });

const toUtcDate = (isoDate: string): Date => new Date(`${isoDate}T00:00:00Z`);

export interface RecordPushParams {
  /** 기록을 남긴 사람 */
  nickname: string;
  recordId: string;
  date: string;
  title: string;
}

/**
 * 새 기록 알림. 누르면 기록 상세를 연다.
 *
 * @example toRecordPushMessage({ nickname: "진아", recordId, date: "2026-11-12", title: "한강 피크닉" })
 * // { title: "진아님이 기록을 남겼어요", body: "11월 12일 · 한강 피크닉", url: "/dates/<id>" }
 */
export const toRecordPushMessage = ({ nickname, recordId, date, title }: RecordPushParams): PushMessage => ({
  title: `${nickname}님이 기록을 남겼어요`,
  body: `${MONTH_DAY_FORMAT.format(toUtcDate(date))} · ${title}`,
  url: toRecordHref(recordId),
});

export interface CommentPushParams {
  nickname: string;
  /** 댓글을 남긴 기록 */
  recordId: string;
  content: string;
}

/**
 * 댓글 알림. 본문은 댓글 앞 50자(줄바꿈은 띄어쓰기로)이고, 누르면 그 기록 상세의 댓글로 간다.
 *
 * @example toCommentPushMessage({ nickname: "진아", recordId, content: "다음에 또 가자" })
 * // { title: "진아님의 댓글", body: "다음에 또 가자", url: "/dates/<id>#record-comments" }
 */
export const toCommentPushMessage = ({ nickname, recordId, content }: CommentPushParams): PushMessage => {
  const characters = Array.from(content.replace(/\s+/g, " ").trim());
  const preview = characters.length > COMMENT_PREVIEW_LENGTH ? `${characters.slice(0, COMMENT_PREVIEW_LENGTH).join("")}…` : characters.join("");
  return { title: `${nickname}님의 댓글`, body: preview, url: `${toRecordHref(recordId)}#${COMMENTS_HEADING_ID}` };
};

export interface EventPushParams {
  nickname: string;
  date: string;
  /** DB의 time 값(HH:MM:SS). 시간 없는 일정이면 `null` */
  startTime: string | null;
  title: string;
}

/**
 * 새 일정 알림. 반복 일정은 첫날을 적고, 누르면 캘린더의 그 날을 연다.
 *
 * @example toEventPushMessage({ nickname: "진아", date: "2026-11-20", startTime: "19:00:00", title: "저녁 약속" })
 * // { title: "진아님이 일정을 추가했어요", body: "11월 20일(금) 19:00 · 저녁 약속", url: "/calendar?month=2026-11&date=2026-11-20" }
 */
export const toEventPushMessage = ({ nickname, date, startTime, title }: EventPushParams): PushMessage => {
  const day = `${MONTH_DAY_FORMAT.format(toUtcDate(date))}(${WEEKDAY_FORMAT.format(toUtcDate(date))})`;
  const when = startTime ? `${day} ${startTime.slice(0, 5)}` : day;
  return { title: `${nickname}님이 일정을 추가했어요`, body: `${when} · ${title}`, url: toCalendarHref({ date }) };
};
