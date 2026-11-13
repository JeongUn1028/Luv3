import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionClaims } from "@/lib/supabase/jwks";
import { HOME_PATH, LOGIN_PATH } from "@/lib/auth/paths";
import { SIGN_OUT_PUSH_ENDPOINT_FIELD } from "@/lib/push/message";

/** 로그아웃 폼에 담긴 이 기기의 구독 주소. 알림을 켜지 않았거나 화면 코드 전에 보낸 폼에는 없다 */
const readPushEndpoint = async (request: NextRequest): Promise<string | undefined> => {
  const form = await request.formData().catch(() => undefined);
  const endpoint = form?.get(SIGN_OUT_PUSH_ENDPOINT_FIELD);
  return typeof endpoint === "string" && endpoint.startsWith("https://") ? endpoint : undefined;
};

/**
 * 로그아웃 버튼(폼 POST). 303으로 보내야 브라우저가 로그인 화면을 GET으로 연다.
 * 이 기기의 구독 주소가 오면 로그아웃하기 전에 그 행을 지운다(#364). 로그아웃한 뒤에는 RLS로 지울 수 없고,
 * 로그아웃이 실패하면 지우지 않아야 알림이 그대로 오기 때문이다. 지우지 못해도 로그아웃은 한다
 * (화면이 브라우저 구독을 끊으므로 다음에 보낼 때 알림 서비스가 사라졌다고 답해 행이 지워진다).
 */
export const POST = async (request: NextRequest) => {
  const supabase = await createClient();
  const endpoint = await readPushEndpoint(request);
  if (endpoint) {
    // 각자 자기 기기의 행만 지울 수 있다(RLS)
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) console.error("로그아웃: 이 기기의 알림 구독을 지우지 못했습니다", error.message);
  }
  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL(LOGIN_PATH, request.url), 303);
};

/**
 * 허용목록 밖 계정을 내보낸다(getCurrentMember에서 리다이렉트).
 * 다른 사이트의 링크로 허용된 사용자가 로그아웃되지 않도록, 허용목록에 있으면 홈으로 돌려보낸다.
 */
export const GET = async (request: NextRequest) => {
  const supabase = await createClient();
  const { data } = await getSessionClaims(supabase.auth);
  if (!data?.claims) {
    return NextResponse.redirect(new URL(LOGIN_PATH, request.url));
  }

  // 일시적인 DB 오류로 허용된 사용자를 로그아웃시키지 않도록, 확인에 실패하면 로그아웃하지 않고 에러를 낸다
  const { data: isMember, error } = await supabase.rpc("is_member");
  if (error) throw new Error(`허용목록을 확인하지 못했습니다: ${error.message}`);

  if (isMember === true) {
    return NextResponse.redirect(new URL(HOME_PATH, request.url));
  }

  await supabase.auth.signOut({ scope: "local" });
  return NextResponse.redirect(new URL(`${LOGIN_PATH}?error=not_member`, request.url));
};
