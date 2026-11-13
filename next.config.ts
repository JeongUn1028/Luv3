import type { NextConfig } from "next";
import { buildSecurityHeaders, resolveHeaderSupabaseUrl } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 사진 좌표의 동네 이름을 계산하는 경로는 경계 파일을 실행 중에 읽으므로 서버 함수에 함께 싣는다(#249, src/lib/places/admdong-server.ts)
  outputFileTracingIncludes: {
    "/api/places/region": ["./data/admdong-boundaries.json"],
  },
  experimental: {
    // 끊긴 동안 화면 이동을 브라우저 오류 화면으로 넘기지 않고 붙들었다가, 다시 연결되면 이어 간다(#106)
    useOffline: true,
  },
  // 모든 응답에 보안 헤더를 붙인다(#170). Supabase 주소를 CSP에 넣으므로 빌드할 때 환경 변수가 있어야 한다(Vercel 미리 보기만 예외)
  headers: async () => {
    const supabaseUrl = resolveHeaderSupabaseUrl({ supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, vercelEnv: process.env.VERCEL_ENV });
    return [
      { source: "/:path*", headers: buildSecurityHeaders({ supabaseUrl, isDev: process.env.NODE_ENV === "development" }) },
      // 알림 서비스 워커(#363)는 고친 버전이 바로 퍼지게 저장해 두지 않는다. 등록할 때도 updateViaCache: "none"을 준다
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }] },
    ];
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
