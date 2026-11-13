import { isObject } from "@/lib/guards";
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
  /** `failedCount`에 센 기기마다의 이유(`toPushFailureReason`). 구독 주소는 담지 않는다 */
  failureReasons: string[];
}

/** 알림 서비스가 구독이 사라졌다고 답하는 상태 코드 */
const EXPIRED_STATUS_CODES = new Set([404, 410]);

const toStatusCode = (reason: unknown): number | undefined =>
  typeof reason === "object" && reason !== null && "statusCode" in reason && typeof reason.statusCode === "number"
    ? reason.statusCode
    : undefined;

/** 이유 글자의 최대 길이. 알림 서비스가 긴 안내문을 보내도 로그·화면이 넘치지 않게 자른다 */
const MAX_REASON_LENGTH = 100;

const shorten = (text: string): string => {
  // 이모지처럼 두 칸으로 적힌 글자를 반으로 쪼개지 않게 글자 단위로 자른다
  const characters = Array.from(text.replace(/\s+/g, " ").trim());
  return characters.length > MAX_REASON_LENGTH ? `${characters.slice(0, MAX_REASON_LENGTH).join("")}…` : characters.join("");
};

/** JSON 본문에서 사유로 읽을 칸. 애플은 `reason`, 파이어폭스(autopush)는 `message`·`error`에 담는다 */
const REASON_FIELDS = ["reason", "message", "error"] as const;

const toJsonReason = (parsed: unknown): string => {
  if (typeof parsed === "string") return parsed;
  if (!isObject(parsed)) return "";
  const reason = REASON_FIELDS.map((name) => parsed[name]).find((value) => typeof value === "string");
  return typeof reason === "string" ? reason : "";
};

/** 알림 서비스가 준 본문에서 사유를 꺼낸다. JSON이면 사유 칸, 글자면 그대로, HTML 오류 화면은 읽을 것이 없어 버린다 */
const toResponseReason = (body: string): string => {
  try {
    return toJsonReason(JSON.parse(body));
  } catch {
    return body.trimStart().startsWith("<") ? "" : body;
  }
};

/**
 * 보내지 못한 이유를 사람이 읽을 짧은 글로 바꾼다(#368). 알림 서비스가 답했으면 상태 코드와 사유,
 * 보내기 전에 멈췄거나(잘못된 열쇠 형식) 시간이 지났으면 오류 문구다. 구독 주소(기기를 가리키는 값)는 넣지 않는다.
 *
 * @example toPushFailureReason(webPushError) // "403 BadJwtToken"
 */
export const toPushFailureReason = (reason: unknown): string => {
  const statusCode = toStatusCode(reason);
  if (statusCode !== undefined) {
    const body = typeof reason === "object" && reason !== null && "body" in reason && typeof reason.body === "string" ? reason.body : "";
    const responseReason = shorten(toResponseReason(body));
    return responseReason ? `${statusCode} ${responseReason}` : String(statusCode);
  }
  return reason instanceof Error && reason.message ? shorten(reason.message) : "알 수 없는 오류";
};

/**
 * 같은 알림을 여러 기기에 한꺼번에 보내고, 기기마다 결과를 모은다. 한 기기가 실패해도 나머지에는 보낸다.
 *
 * @example await sendPushMessage({ subscriptions, message, send: createWebPushSender(vapid) })
 */
export const sendPushMessage = async ({ subscriptions, message, send }: SendPushMessageParams): Promise<PushSendResult> => {
  const payload = JSON.stringify(message);
  const results = await Promise.allSettled(subscriptions.map((subscription) => send(subscription, payload)));

  const expiredEndpoints: string[] = [];
  const failureReasons: string[] = [];
  results.forEach((result, index) => {
    if (result.status === "fulfilled") return;
    const statusCode = toStatusCode(result.reason);
    if (statusCode !== undefined && EXPIRED_STATUS_CODES.has(statusCode)) expiredEndpoints.push(subscriptions[index].endpoint);
    else failureReasons.push(toPushFailureReason(result.reason));
  });
  const sentCount = results.length - expiredEndpoints.length - failureReasons.length;

  return { sentCount, expiredEndpoints, failedCount: failureReasons.length, failureReasons };
};
