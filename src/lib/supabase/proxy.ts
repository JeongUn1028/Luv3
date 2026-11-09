import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "./database.types";
import { getSessionClaims } from "./jwks";
import { getSupabaseEnv } from "@/lib/env";
import { HOME_PATH, LOGIN_PATH, isPublicPath } from "@/lib/auth/paths";

const CACHE_HEADERS = ["cache-control", "expires", "pragma"] as const;

/** 갱신된 세션 쿠키와 캐시 금지 헤더를 리다이렉트 응답에도 옮긴다. 빠뜨리면 다음 요청에서 로그아웃된다. */
const redirectWithSession = (target: URL, sessionResponse: NextResponse): NextResponse => {
  const response = NextResponse.redirect(target);
  sessionResponse.cookies.getAll().forEach((cookie) => response.cookies.set(cookie));
  CACHE_HEADERS.forEach((header) => {
    const value = sessionResponse.headers.get(header);
    if (value) response.headers.set(header, value);
  });
  return response;
};

/**
 * 매 요청마다 세션을 갱신하고, 비로그인 사용자는 로그인 화면으로 보낸다.
 * 허용목록(members) 확인은 DB 조회가 필요해 여기서 하지 않고 서버 컴포넌트와 RLS가 맡는다.
 */
export const updateSession = async (request: NextRequest): Promise<NextResponse> => {
  const { url, publishableKey } = getSupabaseEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet, headers) => {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value));
      },
    },
  });

  // createServerClient와 로그인 확인(getSessionClaims → getClaims) 사이에 다른 코드를 넣지 않는다(무작위 로그아웃 원인).
  const { data } = await getSessionClaims(supabase.auth);
  const isLoggedIn = Boolean(data?.claims);
  const { pathname, search } = request.nextUrl;

  if (!isLoggedIn && !isPublicPath(pathname)) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    if (pathname !== HOME_PATH) loginUrl.searchParams.set("next", `${pathname}${search}`);
    return redirectWithSession(loginUrl, response);
  }

  if (isLoggedIn && pathname === LOGIN_PATH) {
    return redirectWithSession(new URL(HOME_PATH, request.url), response);
  }

  return response;
};
