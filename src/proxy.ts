import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export const proxy = (request: NextRequest) => updateSession(request);

export const config = {
  matcher: [
    // 정적 파일·이미지 최적화·robots.txt·파비콘은 세션 확인 없이 보낸다
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
