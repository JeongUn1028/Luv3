import { defineConfig } from "@playwright/test";
import { BASE_URL, MEMBER_STATE_PATH } from "./e2e/support/constants";
import { DEVICE_SIZE_SPECS, isAllDevicesRun } from "./e2e/support/devices";
import { readLocalSupabase } from "./e2e/support/local-supabase";
import type { DeviceOptions } from "./e2e/support/test";

const supabase = readLocalSupabase();

// 작업 프로세스는 환경 변수를 물려받으므로, 데이터를 만들 때와 테스트에서 같은 기준 시각을 쓴다
process.env.E2E_NOW ??= new Date().toISOString();

// 이 앱은 아이폰 홈 화면 앱으로 쓴다. 두 대상 기기의 화면과 safe-area로 잰다
const createDeviceUse = (width: number, height: number, safeAreaTop: number) => ({
  viewport: { width, height },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  safeArea: { top: safeAreaTop, bottom: 34 },
});

export default defineConfig<DeviceOptions>({
  testDir: "./e2e",
  // e2e/support의 *.test.ts는 Vitest가 돌리는 단위 테스트다
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  workers: process.env.CI ? 4 : undefined,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    // GitHub Actions 러너에 이미 있는 Chrome을 쓰면 브라우저를 따로 받지 않아도 된다
    channel: "chrome",
    storageState: MEMBER_STATE_PATH,
    // 화면 전환 움직임이 끝나기를 기다리지 않고 잰다
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  projects: [
    { name: "iphone-15-pro", use: createDeviceUse(393, 852, 59) },
    {
      name: "iphone-17",
      use: createDeviceUse(402, 874, 62),
      // 평소에는 크기·배치를 재는 스펙만 돌린다. main에 머지될 때는 전체를 돌려 놓친 차이를 잡는다(#194)
      ...(isAllDevicesRun(process.env.E2E_ALL_DEVICES) ? {} : { testMatch: DEVICE_SIZE_SPECS.map((name) => `**/${name}.spec.ts`) }),
    },
  ],
  webServer: {
    command: `pnpm build && pnpm start -p ${new URL(BASE_URL).port}`,
    url: `${BASE_URL}/login`,
    timeout: 300_000,
    // 다른 빌드를 재지 않도록 떠 있는 서버를 다시 쓰지 않는다
    reuseExistingServer: false,
    // 프로세스 환경 변수가 .env.local보다 앞서므로, .env.local이 운영을 가리켜도 로컬 Supabase만 쓴다
    env: {
      NEXT_PUBLIC_SUPABASE_URL: supabase.url,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
      // 장소 찾기 버튼을 켜려는 값이다. 카카오를 실제로 부르지 않게 E2E는 우리 API의 응답을 정해 둔다
      KAKAO_REST_API_KEY: "e2e-dummy",
      // 지도 버튼을 켜려는 값이다. 카카오를 실제로 부르지 않게 E2E는 SDK를 가짜로 대신한다
      NEXT_PUBLIC_KAKAO_MAP_KEY: "e2e-dummy",
    },
  },
});
