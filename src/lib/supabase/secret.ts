import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabaseEnv } from "@/lib/env";

/**
 * RLS와 함수 권한을 넘는 비밀 키(`SUPABASE_SECRET_KEY`) 클라이언트. 키가 없으면 `undefined`.
 * 회원이 브라우저에서 직접 부르면 안 되는 일(모든 사진 파일 정리, 상대 기기 구독을 읽는 알림 확인)만 서버 경로에서 쓴다.
 * 세션을 들고 있지 않아 `auth.uid()`가 없으므로, 회원 확인은 부르는 쪽이 세션 클라이언트로 먼저 한다.
 *
 * @example const supabase = createSecretClient(); if (!supabase) return toErrorResponse("NOT_CONFIGURED", ..., 503);
 */
export const createSecretClient = (): SupabaseClient<Database> | undefined => {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return undefined;
  return createClient<Database>(getSupabaseEnv().url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
};
