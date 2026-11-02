import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { connection } from "next/server";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "@/lib/env";

/** 서버 컴포넌트·라우트 핸들러용 Supabase 클라이언트. 요청마다 새로 만든다. */
export const createClient = async () => {
  // Supabase 클라이언트는 세션 만료 확인에 Date.now()를 쓴다. cacheComponents의 prerender·prefetch 단계에서
  // 실행되면 에러가 나므로 요청 시점에만 실행되게 한다.
  await connection();
  const { url, publishableKey } = getSupabaseEnv();
  const cookieStore = await cookies();

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // 서버 컴포넌트에서는 쿠키를 쓸 수 없다. 세션 갱신은 proxy.ts가 매 요청 처리하므로 무시해도 된다.
        }
      },
    },
  });
};
