import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSessionClaims } from "@/lib/supabase/jwks";
import { HOME_PATH, LOGIN_PATH } from "@/lib/auth/paths";

/** 로그아웃 버튼(폼 POST). 303으로 보내야 브라우저가 로그인 화면을 GET으로 연다. */
export const POST = async (request: NextRequest) => {
  const supabase = await createClient();
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
