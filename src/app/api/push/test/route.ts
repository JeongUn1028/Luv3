import { getCurrentMember } from "@/lib/auth/member";
import { NO_STORE_HEADERS, toErrorResponse } from "@/lib/api-response";
import { PUSH_TEST_MESSAGE } from "@/lib/push/message";
import { sendPushMessage } from "@/lib/push/send";
import { readVapidConfig } from "@/lib/push/read-vapid";
import { parseTestPushBody, TEST_PUSH_FAILED_MESSAGE } from "@/lib/push/test-push";
import { createWebPushSender } from "@/lib/push/web-push-sender";
import { createClient } from "@/lib/supabase/server";

const NOT_CONFIGURED_MESSAGE = "알림 설정이 아직 없어요.";

/**
 * 설정 화면의 "시험 알림 보내기"(#363). 로그인한 사람의 구독 중, 요청을 보낸 기기(본문의 구독 주소)에만 시험 알림을 보낸다.
 * 구독은 RLS로 자기 것만 읽고, 알림 서비스가 사라졌다고 답한 기기는 지운다.
 * 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 */
export const POST = async (request: Request): Promise<Response> => {
  const member = await getCurrentMember();

  const vapid = readVapidConfig("시험 알림");
  if (!vapid) return toErrorResponse("PUSH_NOT_CONFIGURED", NOT_CONFIGURED_MESSAGE, 503);

  const body = parseTestPushBody(await request.json().catch(() => undefined));
  if (!body) return toErrorResponse("INVALID_BODY", "이 기기에서 알림을 다시 켜 주세요.", 400);

  const supabase = await createClient();
  const { data: subscriptions, error } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("member_id", member.id)
    .eq("endpoint", body.endpoint);
  if (error) {
    console.error("시험 알림: 구독을 읽지 못했습니다", error.message);
    return toErrorResponse("PUSH_SUBSCRIPTIONS_LOAD_FAILED", TEST_PUSH_FAILED_MESSAGE, 502);
  }
  if (subscriptions.length === 0) return toErrorResponse("PUSH_NOT_SUBSCRIBED", "이 기기에서 알림을 먼저 켜 주세요.", 409);

  const result = await sendPushMessage({ subscriptions, message: PUSH_TEST_MESSAGE, send: createWebPushSender(vapid) });

  if (result.expiredEndpoints.length > 0) {
    const { error: deleteError } = await supabase.from("push_subscriptions").delete().in("endpoint", result.expiredEndpoints);
    // 지우지 못해도 다음에 보낼 때 다시 지운다. 보낸 결과는 그대로 알린다
    if (deleteError) console.error("시험 알림: 사라진 구독을 지우지 못했습니다", deleteError.message);
  }
  // 받는 쪽 주소에는 기기를 가리키는 값이 있어 남기지 않고 수만 남긴다
  if (result.failedCount > 0) {
    const counts = { sentCount: result.sentCount, failedCount: result.failedCount, expiredCount: result.expiredEndpoints.length };
    console.error("시험 알림: 보내지 못한 기기가 있습니다", JSON.stringify(counts));
  }

  if (result.sentCount === 0) {
    return result.failedCount === 0
      ? toErrorResponse("PUSH_NOT_SUBSCRIBED", "알림이 꺼진 기기예요. 이 기기에서 알림을 다시 켜 주세요.", 409)
      : toErrorResponse("PUSH_SEND_FAILED", TEST_PUSH_FAILED_MESSAGE, 502);
  }
  return Response.json({ sentCount: result.sentCount }, { headers: NO_STORE_HEADERS });
};
