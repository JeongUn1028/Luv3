import type { NextConfig } from "next";
import { getSupabaseEnv } from "./src/lib/env";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    // 끊긴 동안 화면 이동을 브라우저 오류 화면으로 넘기지 않고 붙들었다가, 다시 연결되면 이어 간다(#106)
    useOffline: true,
  },
  // 모든 응답에 보안 헤더를 붙인다(#170). Supabase 주소를 CSP에 넣으므로 빌드할 때 환경 변수가 있어야 한다
  headers: async () => [
    {
      source: "/:path*",
      headers: buildSecurityHeaders({ supabaseUrl: getSupabaseEnv().url, isDev: process.env.NODE_ENV === "development" }),
    },
  ],
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
