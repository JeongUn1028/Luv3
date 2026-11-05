import { NextResponse, type NextRequest } from "next/server";
import { getLegacyHomeRedirect } from "@/lib/home/legacy";
import { updateSession } from "@/lib/supabase/proxy";

export const proxy = (request: NextRequest) => {
  // Next는 끊긴 뒤 연결을 HEAD로 확인하고 200ms 뒤 끊어 버린다. 여기서 세션을 갱신하면 새 쿠키를 받지 못한 채 예전 토큰만 무효가 되어 로그아웃될 수 있다(#106)
  if (request.method === "HEAD") return new NextResponse(null, { status: 204 });
  // 예전 홈 주소(/?view=calendar)는 세션 확인 전에 캘린더 탭으로 넘긴다. 로그인 전이면 넘어간 주소에서 로그인 화면으로 보내 로그인 뒤 캘린더로 돌아온다
  const legacyTarget = getLegacyHomeRedirect(request.nextUrl);
  if (legacyTarget) return NextResponse.redirect(new URL(legacyTarget, request.url));
  return updateSession(request);
};

export const config = {
  matcher: [
    // 정적 파일·이미지 최적화·robots.txt·파비콘·웹앱 manifest는 세션 확인 없이 보낸다(홈 화면 추가는 로그인 전에도 받아야 한다).
    // 파일 이름은 끝까지 맞아야 하고(뒤에 경로가 더 붙으면 페이지), 점은 문자열 안에서 `\\.`로 써야 정규식의 글자 점이 된다
    "/((?!_next/static|_next/image|(?:favicon\\.ico|robots\\.txt|manifest\\.webmanifest)$|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
