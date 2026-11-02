import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "@/lib/env";

/** 클라이언트 컴포넌트용 Supabase 클라이언트. 세션은 쿠키에 저장돼 서버와 공유된다. */
export const createClient = () => {
  const { url, publishableKey } = getSupabaseEnv();
  return createBrowserClient<Database>(url, publishableKey);
};
