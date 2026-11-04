import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { createSessionAwareFetch, SESSION_LOST_EVENT } from "@/lib/auth/session-lost";
import { getSupabaseEnv } from "@/lib/env";

// 저장·삭제·사진 올리기를 하는 곳마다 고치지 않도록 요청 한곳에서 로그인 문제를 알아챈다(#102)
const sessionAwareFetch = createSessionAwareFetch(
  (input, init) => fetch(input, init),
  () => window.dispatchEvent(new Event(SESSION_LOST_EVENT)),
);

/** 클라이언트 컴포넌트용 Supabase 클라이언트. 세션은 쿠키에 저장돼 서버와 공유된다. */
export const createClient = () => {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey, { global: { fetch: sessionAwareFetch } });
};
