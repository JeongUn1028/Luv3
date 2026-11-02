export interface SupabaseEnv {
  url: string;
  publishableKey: string;
}

interface RawSupabaseEnv {
  url: string | undefined;
  publishableKey: string | undefined;
}

/**
 * Supabase 접속 정보를 검증한다. 빠진 값이 있으면 어떤 변수를 채워야 하는지 알려 준다.
 *
 * @example parseSupabaseEnv({ url: "http://127.0.0.1:54321", publishableKey: "sb_publishable_..." })
 */
export const parseSupabaseEnv = ({ url, publishableKey }: RawSupabaseEnv): SupabaseEnv => {
  const missing = [
    url ? undefined : "NEXT_PUBLIC_SUPABASE_URL",
    publishableKey ? undefined : "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  ].filter((name) => name !== undefined);

  if (missing.length > 0 || !url || !publishableKey) {
    throw new Error(`환경 변수가 없습니다: ${missing.join(", ")} (.env.example 참고)`);
  }

  if (!URL.canParse(url)) {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL이 올바른 URL이 아닙니다: ${url}`);
  }

  return { url, publishableKey };
};

/** 브라우저 번들에 값이 들어가도록 process.env를 정적으로 참조한다. */
export const getSupabaseEnv = (): SupabaseEnv =>
  parseSupabaseEnv({
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  });
