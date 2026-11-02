import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { LOGIN_PATH, getSafeNextPath } from "@/lib/auth/paths";

/**
 * 매직 링크 메일의 token_hash를 검증해 세션을 만든다.
 * PKCE 코드 교환과 달리 메일 앱이 다른 브라우저로 링크를 열어도 동작한다.
 */
export const GET = async (request: NextRequest) => {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");

  if (tokenHash && type === "email") {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type: "email", token_hash: tokenHash });
    if (!error) {
      return NextResponse.redirect(new URL(getSafeNextPath(searchParams.get("next")), request.url));
    }
  }

  return NextResponse.redirect(new URL(`${LOGIN_PATH}?error=link_invalid`, request.url));
};
