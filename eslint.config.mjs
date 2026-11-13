import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // 로그인 확인은 넣어 둔 공개 키를 쓰는 getSessionClaims로만 한다. 바로 부르면 서버가 새로 뜰 때마다 공개 키를 다시 받는다(#202)
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/supabase/jwks.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { property: "getClaims", message: "getSessionClaims(supabase.auth)(@/lib/supabase/jwks)를 쓰세요." },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // 라이브러리를 그대로 복사한 파일(src/lib/photos/compression-lib.ts)
    "public/vendor/**",
  ]),
]);

export default eslintConfig;
