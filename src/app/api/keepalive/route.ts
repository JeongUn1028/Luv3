import { createClient } from "@supabase/supabase-js";
import { isAuthorizedCronRequest } from "@/lib/cron";
import { getSupabaseEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/database.types";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Vercel Cron이 하루 한 번 부르는 경로(vercel.json). 무료 플랜 Supabase가 7일 동안 요청이 없어 일시정지되지 않게
 * 데이터를 읽지 않는 `keepalive()`만 부른다. CRON_SECRET이 맞는 요청만 받는다.
 */
export const GET = async (request: Request): Promise<Response> => {
  if (!isAuthorizedCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return Response.json({ code: "UNAUTHORIZED", message: "허락되지 않은 요청입니다." }, { status: 401, headers: NO_STORE });
  }

  // 로그인 세션 없이 부르는 요청이라 쿠키를 다루는 서버 클라이언트 대신 세션을 저장하지 않는 클라이언트를 쓴다
  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createClient<Database>(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("keepalive");
  if (error) {
    // Cron 실행 기록에 원인이 남도록 서버 로그로 남기고, 실패 상태 코드로 Vercel에 알린다
    console.error("keepalive 실패", error);
    return Response.json({ code: "KEEPALIVE_FAILED", message: "DB를 깨우지 못했습니다." }, { status: 502, headers: NO_STORE });
  }

  return Response.json({ ok: true }, { headers: NO_STORE });
};
