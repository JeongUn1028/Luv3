import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    include: ["{src,supabase,scripts,e2e}/**/*.test.{ts,tsx}"],
    environment: "node",
    // `pnpm test:coverage`로만 잰다. 화면·서버 연결 코드는 E2E가 확인해 단위 테스트 수치에는 잡히지 않는다(#256)
    coverage: {
      provider: "v8",
      include: ["src/**/*.{ts,tsx}", "scripts/**/*.{ts,mts}"],
      exclude: ["**/*.test.{ts,tsx}", "src/test-utils/**", "src/lib/supabase/database.types.ts"],
      // CI 로그에는 합계만 남긴다. 파일별 표는 `pnpm test:coverage --coverage.reporter=text`로 본다
      reporter: ["text-summary"],
      // 로직 폴더만 바닥값을 둔다. 2026-11-10 src/lib 측정값(줄 79.5%·분기 84.9%)보다 조금 낮게 잡아 흔들림에는 버티고,
      // 테스트 없는 로직이 쌓이면 실패한다. 화면 코드(src/app·src/components)는 E2E가 맡아 수치만 보여 준다
      thresholds: {
        "src/lib/**": { lines: 75, branches: 80 },
      },
    },
  },
});
