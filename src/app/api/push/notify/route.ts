import { getCurrentMember } from "@/lib/auth/member";
import { NO_STORE_HEADERS, toErrorResponse } from "@/lib/api-response";
import type { PushMessage } from "@/lib/push/message";
import {
  parsePartnerPushBody,
  parsePartnerPushClaim,
  toCommentPushMessage,
  toEventPushMessage,
  toRecordPushMessage,
  toTodoPushMessage,
  type PartnerPushBody,
  type PartnerPushRefusal,
} from "@/lib/push/partner-push";
import { readVapidConfig } from "@/lib/push/read-vapid";
import { sendPushMessage } from "@/lib/push/send";
import { createWebPushSender } from "@/lib/push/web-push-sender";
import { createSecretClient } from "@/lib/supabase/secret";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;
type SecretClient = NonNullable<ReturnType<typeof createSecretClient>>;

const FAILED_MESSAGE = "알림을 보내지 못했어요.";

/** DB가 보내지 않기로 한 이유별 응답. 부탁한 휴대폰은 결과를 보지 않으므로(저장 화면에 영향 없음) 기록용이다 */
const REFUSAL_RESPONSES: Record<PartnerPushRefusal, { code: string; message: string; status: number }> = {
  "not-found": { code: "PUSH_TARGET_NOT_FOUND", message: "알릴 글이 없어요.", status: 404 },
  "not-author": { code: "PUSH_NOT_AUTHOR", message: "직접 남긴 글만 알릴 수 있어요.", status: 403 },
  "not-new": { code: "PUSH_NOT_NEW", message: "새로 추가한 일정만 알려요.", status: 409 },
  "too-old": { code: "PUSH_TOO_OLD", message: "방금 남긴 글만 알릴 수 있어요.", status: 409 },
  "already-sent": { code: "PUSH_ALREADY_SENT", message: "이미 알린 글이에요.", status: 409 },
};

const toRefusalResponse = (refusal: PartnerPushRefusal): Response => {
  const { code, message, status } = REFUSAL_RESPONSES[refusal];
  return toErrorResponse(code, message, status);
};

/**
 * 보내지 못한 알림을 되돌린다(#409). claim이 보내기 전에 남긴 보낸 기록을 지우고 올린 숫자를 내려, 다시 부탁하면 다시 보낼 수 있게 한다.
 * 되돌리지 못해도 응답은 바꾸지 않는다(부탁한 휴대폰은 결과를 보지 않는다)
 */
const releaseClaim = async (supabase: SecretClient, { kind, id }: PartnerPushBody, releaseToken: string): Promise<void> => {
  const { error } = await supabase.rpc("release_partner_push", { p_kind: kind, p_target_id: id, p_release_token: releaseToken });
  if (error) console.error("상대 알림: 보내지 못한 알림을 되돌리지 못했습니다", error.message);
};

/** 글을 읽지 못했을 때 loadMessage 대신 돌려받는 표시. 글이 없는 경우(`undefined`)와 가른다 */
const LOAD_FAILED: unique symbol = Symbol("load-failed");

/**
 * 알릴 글이 아직 있는지 보고 알림 문구를 만든다. 글이 없으면(지워졌거나 잘못된 id) `undefined`.
 * 문구에는 글 내용을 넣지 않으므로 누르면 열 주소에 필요한 칸만 읽는다
 */
const loadMessage = async (supabase: ServerClient, { kind, id }: PartnerPushBody, nickname: string): Promise<PushMessage | undefined> => {
  if (kind === "record") {
    const { data, error } = await supabase.from("dates").select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`알릴 기록을 읽지 못했습니다: ${error.message}`, { cause: error });
    return data ? toRecordPushMessage({ nickname, recordId: id }) : undefined;
  }
  if (kind === "comment") {
    const { data, error } = await supabase.from("comments").select("date_id").eq("id", id).maybeSingle();
    if (error) throw new Error(`알릴 댓글을 읽지 못했습니다: ${error.message}`, { cause: error });
    return data ? toCommentPushMessage({ nickname, recordId: data.date_id }) : undefined;
  }
  if (kind === "todo") {
    const { data, error } = await supabase.from("todos").select("id").eq("id", id).maybeSingle();
    if (error) throw new Error(`알릴 할 일을 읽지 못했습니다: ${error.message}`, { cause: error });
    return data ? toTodoPushMessage({ nickname }) : undefined;
  }
  const { data, error } = await supabase.from("events").select("date").eq("id", id).maybeSingle();
  if (error) throw new Error(`알릴 일정을 읽지 못했습니다: ${error.message}`, { cause: error });
  return data ? toEventPushMessage({ nickname, date: data.date }) : undefined;
};

/**
 * 상대 활동 알림(#364). 기록·댓글·일정·할 일을 저장한 휴대폰이 부탁하면, DB(`claim_partner_push`)가 부탁이 맞는지 확인하고
 * 받을 사람(나를 뺀 회원 중 그 종류를 켜 둔 사람)의 기기 구독과 올린 앱 아이콘 숫자를 돌려준다. 그 기기들에 알림을 보낸다.
 * 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 * 상대 기기의 구독을 다루는 알림 함수(확인·되돌리기·사라진 구독 지우기)는 비밀 키로만 부를 수 있다(#412). 세션으로 회원을 확인한 뒤
 * 그 회원 id를 넘긴다. 알릴 글은 회원 세션으로 읽는다
 */
export const POST = async (request: Request): Promise<Response> => {
  const member = await getCurrentMember();

  const vapid = readVapidConfig("상대 알림");
  if (!vapid) return toErrorResponse("PUSH_NOT_CONFIGURED", "알림 설정이 아직 없어요.", 503);

  const body = parsePartnerPushBody(await request.json().catch(() => undefined));
  if (!body) return toErrorResponse("INVALID_BODY", "알릴 글을 알 수 없어요.", 400);

  const secret = createSecretClient();
  if (!secret) {
    console.error("상대 알림: SUPABASE_SECRET_KEY가 없습니다");
    return toErrorResponse("PUSH_NOT_CONFIGURED", "알림 설정이 아직 없어요.", 503);
  }

  // 보내도 되는지 먼저 확인한다. 거절될 부탁(이미 알림, 남의 글 등)에는 글을 읽지 않는다
  const { data, error } = await secret.rpc("claim_partner_push", { p_member_id: member.id, p_kind: body.kind, p_target_id: body.id });
  const claim = error ? undefined : parsePartnerPushClaim(data);
  if (!claim) {
    console.error("상대 알림: 보낼 곳을 확인하지 못했습니다", error?.message ?? "알 수 없는 답");
    return toErrorResponse("PUSH_CLAIM_FAILED", FAILED_MESSAGE, 502);
  }
  if (claim.status !== "ready") return toRefusalResponse(claim.status);

  const supabase = await createClient();
  const message = await loadMessage(supabase, body, member.nickname).catch((loadError: unknown): typeof LOAD_FAILED => {
    console.error("상대 알림:", loadError instanceof Error ? loadError.message : String(loadError));
    return LOAD_FAILED;
  });
  if (message === LOAD_FAILED) {
    await releaseClaim(secret, body, claim.releaseToken);
    return toErrorResponse("PUSH_TARGET_LOAD_FAILED", FAILED_MESSAGE, 502);
  }
  // 확인과 읽기 사이에 지워졌으면 보내지 않는다. 올린 숫자는 내린다
  if (!message) {
    await releaseClaim(secret, body, claim.releaseToken);
    return toRefusalResponse("not-found");
  }

  const send = createWebPushSender(vapid);
  const results = await Promise.all(
    claim.recipients.map(({ badge, subscriptions }) => sendPushMessage({ subscriptions, message: { ...message, badge }, send })),
  );
  const expiredEndpoints = results.flatMap((result) => result.expiredEndpoints);
  const sentCount = results.reduce((sum, result) => sum + result.sentCount, 0);
  const failureReasons = results.flatMap((result) => result.failureReasons);
  const failedCount = failureReasons.length;

  // 한 기기에도 보내지 못했고 장애·열쇠 문제 같은 실패가 있으면 되돌린다. 사라진 구독뿐이면 다시 보내도 받을 기기가 없다
  if (sentCount === 0 && failedCount > 0) await releaseClaim(secret, body, claim.releaseToken);

  if (expiredEndpoints.length > 0) {
    // 상대 기기의 구독이라 RLS로는 지울 수 없어 서버만 부르는 함수로 지운다. 지우지 못해도 다음에 보낼 때 다시 지운다
    const { error: deleteError } = await secret.rpc("delete_push_subscriptions", { p_endpoints: expiredEndpoints });
    if (deleteError) console.error("상대 알림: 사라진 구독을 지우지 못했습니다", deleteError.message);
  }
  // 받는 쪽 주소에는 기기를 가리키는 값이 있어 남기지 않고 수와 이유만 남긴다
  if (failedCount > 0) {
    // 열쇠를 잘못 넣으면 모든 기기가 같은 이유로 실패한다. 같은 이유는 한 번만 적고 수를 센다
    const reasons = failureReasons.reduce<Record<string, number>>((counts, reason) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
    const summary = { sentCount, failedCount, expiredCount: expiredEndpoints.length, reasons };
    console.error("상대 알림: 보내지 못한 기기가 있습니다", JSON.stringify(summary));
  }

  return Response.json({ sentCount }, { headers: NO_STORE_HEADERS });
};
