// 설정 화면의 "시험 알림 보내기"(#363) 요청과 응답 읽기. 서버 경로와 화면이 함께 쓴다

import { isObject } from "@/lib/guards";

/** 시험 알림 요청 본문. 지금 기기의 구독 주소에만 보낸다 */
export interface TestPushBody {
  endpoint: string;
}

/**
 * 시험 알림 요청 본문을 읽는다. 구독 주소가 없거나 https가 아니면 `undefined`.
 *
 * @example const body = parseTestPushBody(await request.json().catch(() => undefined));
 */
export const parseTestPushBody = (value: unknown): TestPushBody | undefined => {
  if (!isObject(value) || typeof value.endpoint !== "string") return undefined;
  return value.endpoint.startsWith("https://") ? { endpoint: value.endpoint } : undefined;
};

/** 화면이 시험 알림 응답에서 알아야 할 것 */
export type TestPushOutcome =
  | { kind: "sent" }
  /** 서버에 이 기기의 구독이 없다. 켜기 버튼을 다시 보여 준다 */
  | { kind: "not-subscribed"; message: string }
  | { kind: "failed"; message: string };

export interface ToTestPushOutcomeParams {
  ok: boolean;
  /** 로그인이 끊겨 로그인 화면으로 넘겨졌는지(`Response.redirected`). 그때 받은 200은 로그인 화면이다 */
  redirected: boolean;
  /** 응답 본문(JSON). 오류면 `{ code, message }` */
  body: unknown;
}

export const TEST_PUSH_FAILED_MESSAGE = "시험 알림을 보내지 못했어요. 잠시 후 다시 시도해 주세요.";
const SIGNED_OUT_MESSAGE = "로그인이 끊겼어요. 다시 로그인한 뒤 보내 주세요.";

/**
 * 시험 알림 응답을 화면이 보여 줄 결과로 바꾼다.
 *
 * @example toTestPushOutcome({ ok: response.ok, redirected: response.redirected, body: await response.json().catch(() => undefined) })
 */
export const toTestPushOutcome = ({ ok, redirected, body }: ToTestPushOutcomeParams): TestPushOutcome => {
  if (redirected) return { kind: "failed", message: SIGNED_OUT_MESSAGE };
  if (ok) return { kind: "sent" };
  const code = isObject(body) && typeof body.code === "string" ? body.code : undefined;
  const message = isObject(body) && typeof body.message === "string" ? body.message : TEST_PUSH_FAILED_MESSAGE;
  return code === "PUSH_NOT_SUBSCRIBED" ? { kind: "not-subscribed", message } : { kind: "failed", message };
};
