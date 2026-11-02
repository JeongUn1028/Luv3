import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export const proxy = (request: NextRequest) => updateSession(request);

export const config = {
  matcher: [
    // 정적 파일·이미지 최적화·robots.txt·파비콘·웹앱 manifest는 세션 확인 없이 보낸다(홈 화면 추가는 로그인 전에도 받아야 한다).
    // 파일 이름은 끝까지 맞아야 하고(뒤에 경로가 더 붙으면 페이지), 점은 문자열 안에서 `\\.`로 써야 정규식의 글자 점이 된다
    "/((?!_next/static|_next/image|(?:favicon\\.ico|robots\\.txt|manifest\\.webmanifest)$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
