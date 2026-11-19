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
  {
    // 브라우저용 Supabase는 쓰는 순간에 불러온다. 바로 불러오면 그 화면의 첫 묶음에 라이브러리가 실린다(#457, #486)
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/supabase/load-client.ts", "**/*.test.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              // 별칭과 상대 경로를 모두 막는다
              group: ["**/supabase/client"],
              allowTypeImports: true,
              message: "loadClient 또는 withLoadedClient(@/lib/supabase/load-client)를 쓰세요.",
            },
          ],
        },
      ],
    },
  },
  {
    // 팀 규칙(company 컨벤션 typescript.md·react.md)을 린트로 지킨다(#359)
    files: ["**/*.{ts,tsx,mts}"],
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-non-null-assertion": "error",
      // as보다 타입 가드를 쓴다. 객체 리터럴에 붙인 단언은 빠진 칸을 숨기므로 막는다
      "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "as", objectLiteralTypeAssertions: "never" }],
      "react/function-component-definition": ["error", { namedComponents: "arrow-function", unnamedComponents: "arrow-function" }],
      "import/no-default-export": "error",
    },
  },
  {
    // Next가 default export로 읽는 화면·메타데이터 파일과 도구 설정 파일만 예외다
    files: [
      "src/app/**/{page,layout,not-found,forbidden,unauthorized,error,global-error,loading,template,default}.{ts,tsx}",
      "src/app/**/{manifest,robots,sitemap,icon,apple-icon,opengraph-image,twitter-image}.{ts,tsx}",
      "*.config.{ts,mts,mjs}",
      "e2e/global-setup.ts",
    ],
    rules: { "import/no-default-export": "off" },
  },
  {
    // 테스트의 가짜 객체는 필요한 칸만 채워 단언한다
    files: ["**/*.test.{ts,tsx}", "e2e/**/*.ts"],
    rules: { "@typescript-eslint/consistent-type-assertions": ["error", { assertionStyle: "as", objectLiteralTypeAssertions: "allow" }] },
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
