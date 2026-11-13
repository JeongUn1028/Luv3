import { getCurrentMember } from "@/lib/auth/member";
import { NO_STORE_HEADERS, toErrorResponse } from "@/lib/api-response";
import type { PushMessage } from "@/lib/push/message";
import {
  parsePartnerPushBody,
  parsePartnerPushClaim,
  toCommentPushMessage,
  toEventPushMessage,
  toRecordPushMessage,
  type PartnerPushBody,
  type PartnerPushRefusal,
} from "@/lib/push/partner-push";
import { readVapidConfig } from "@/lib/push/read-vapid";
import { sendPushMessage } from "@/lib/push/send";
import { createWebPushSender } from "@/lib/push/web-push-sender";
import { createClient } from "@/lib/supabase/server";

type ServerClient = Awaited<ReturnType<typeof createClient>>;

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

/** 글을 읽지 못했을 때 loadMessage 대신 돌려받는 표시. 글이 없는 경우(`undefined`)와 가른다 */
const LOAD_FAILED: unique symbol = Symbol("load-failed");

/** 알릴 글을 읽어 알림 문구를 만든다. 글이 없으면(지워졌거나 잘못된 id) `undefined`. 문구는 휴대폰이 보낸 값을 믿지 않고 DB에서 만든다 */
const loadMessage = async (supabase: ServerClient, { kind, id }: PartnerPushBody, nickname: string): Promise<PushMessage | undefined> => {
  if (kind === "record") {
    const { data, error } = await supabase.from("dates").select("date, title").eq("id", id).maybeSingle();
    if (error) throw new Error(`알릴 기록을 읽지 못했습니다: ${error.message}`, { cause: error });
    return data ? toRecordPushMessage({ nickname, recordId: id, date: data.date, title: data.title }) : undefined;
  }
  if (kind === "comment") {
    const { data, error } = await supabase.from("comments").select("date_id, content").eq("id", id).maybeSingle();
    if (error) throw new Error(`알릴 댓글을 읽지 못했습니다: ${error.message}`, { cause: error });
    return data ? toCommentPushMessage({ nickname, recordId: data.date_id, content: data.content }) : undefined;
  }
  const { data, error } = await supabase.from("events").select("date, start_time, title").eq("id", id).maybeSingle();
  if (error) throw new Error(`알릴 일정을 읽지 못했습니다: ${error.message}`, { cause: error });
  return data ? toEventPushMessage({ nickname, date: data.date, startTime: data.start_time, title: data.title }) : undefined;
};

/**
 * 상대 활동 알림(#364). 기록·댓글·일정을 저장한 휴대폰이 부탁하면, DB(`claim_partner_push`)가 부탁이 맞는지 확인하고
 * 받을 사람(나를 뺀 회원 중 그 종류를 켜 둔 사람)의 기기 구독과 올린 앱 아이콘 숫자를 돌려준다. 그 기기들에 알림을 보낸다.
 * 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 */
export const POST = async (request: Request): Promise<Response> => {
  const member = await getCurrentMember();

  const vapid = readVapidConfig("상대 알림");
  if (!vapid) return toErrorResponse("PUSH_NOT_CONFIGURED", "알림 설정이 아직 없어요.", 503);

  const body = parsePartnerPushBody(await request.json().catch(() => undefined));
  if (!body) return toErrorResponse("INVALID_BODY", "알릴 글을 알 수 없어요.", 400);

  // 보내도 되는지 먼저 확인한다. 거절될 부탁(이미 알림, 남의 글 등)에는 글을 읽지 않는다
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("claim_partner_push", { p_kind: body.kind, p_target_id: body.id });
  const claim = error ? undefined : parsePartnerPushClaim(data);
  if (!claim) {
    console.error("상대 알림: 보낼 곳을 확인하지 못했습니다", error?.message ?? "알 수 없는 답");
    return toErrorResponse("PUSH_CLAIM_FAILED", FAILED_MESSAGE, 502);
  }
  if (claim.status !== "ready") return toRefusalResponse(claim.status);

  const message = await loadMessage(supabase, body, member.nickname).catch((loadError: unknown): typeof LOAD_FAILED => {
    console.error("상대 알림:", loadError instanceof Error ? loadError.message : String(loadError));
    return LOAD_FAILED;
  });
  if (message === LOAD_FAILED) return toErrorResponse("PUSH_TARGET_LOAD_FAILED", FAILED_MESSAGE, 502);
  // 확인과 읽기 사이에 지워졌으면 보내지 않는다
  if (!message) return toRefusalResponse("not-found");

  const send = createWebPushSender(vapid);
  const results = await Promise.all(
    claim.recipients.map(({ badge, subscriptions }) => sendPushMessage({ subscriptions, message: { ...message, badge }, send })),
  );
  const expiredEndpoints = results.flatMap((result) => result.expiredEndpoints);
  const sentCount = results.reduce((sum, result) => sum + result.sentCount, 0);
  const failedCount = results.reduce((sum, result) => sum + result.failedCount, 0);

  if (expiredEndpoints.length > 0) {
    // 상대 기기의 구독이라 RLS로는 지울 수 없어 함수로 지운다. 지우지 못해도 다음에 보낼 때 다시 지운다
    const { error: deleteError } = await supabase.rpc("delete_push_subscriptions", { p_endpoints: expiredEndpoints });
    if (deleteError) console.error("상대 알림: 사라진 구독을 지우지 못했습니다", deleteError.message);
  }
  // 받는 쪽 주소에는 기기를 가리키는 값이 있어 남기지 않고 수만 남긴다
  if (failedCount > 0) {
    console.error("상대 알림: 보내지 못한 기기가 있습니다", JSON.stringify({ sentCount, failedCount, expiredCount: expiredEndpoints.length }));
  }

  return Response.json({ sentCount }, { headers: NO_STORE_HEADERS });
};
