import { availableParallelism } from "node:os";
import { defineConfig } from "@playwright/test";
import { BASE_URL, MEMBER_STATE_PATH } from "./e2e/support/constants";
import { DEVICE_SIZE_SPECS, isAllDevicesRun, SHARED_DATA_SPECS, TARGET_DEVICES } from "./e2e/support/devices";
import { readLocalSupabase } from "./e2e/support/local-supabase";
import type { DeviceOptions } from "./e2e/support/test";

const supabase = readLocalSupabase();

// 작업 프로세스는 환경 변수를 물려받으므로, 데이터를 만들 때와 테스트에서 같은 기준 시각을 쓴다
process.env.E2E_NOW ??= new Date().toISOString();

/** 로컬 E2E 작업자 상한. 12개는 Chrome 창이 죽거나 시간 초과가 났고, 4개는 실패 없이 거의 같은 시간에 끝났다(#243) */
const LOCAL_MAX_WORKERS = 4;

const [IPHONE_15_PRO, IPHONE_17] = TARGET_DEVICES;
const toSpecGlobs = (names: readonly string[]): string[] => names.map((name) => `**/${name}.spec.ts`);
/** 공유 데이터 스펙을 맨 마지막에 돌리려고 두는 빈 프로젝트. 테스트는 없고, 끝난 뒤 돌 프로젝트(teardown)만 정한다 */
const SHARED_DATA_GATE = "shared-data-gate";
const SHARED_DATA = "shared-data";

export default defineConfig<DeviceOptions>({
  testDir: "./e2e",
  // e2e/support의 *.test.ts는 Vitest가 돌리는 단위 테스트다
  testMatch: "**/*.spec.ts",
  globalSetup: "./e2e/global-setup.ts",
  // CI 러너(4코어)는 앱 서버·로컬 Supabase·Chrome을 함께 돌린다. 기본값(코어의 절반)도 2지만 러너가 바뀌어도 그대로이게 고정한다.
  // 4개로 재 보니 테스트 시간이 대마다 0.2~0.9분, 전체로는 약 30초 줄었을 뿐이라 부하 위험을 지지 않는다(#241).
  // 로컬은 기본값(코어의 절반)에 4개 상한을 둔다. 코어가 많아 작업자가 늘면 Chrome 창이 죽거나 시간 초과가 났다(근거는 README, #243)
  workers: process.env.CI ? 2 : Math.min(LOCAL_MAX_WORKERS, Math.max(1, Math.floor(availableParallelism() / 2))),
  // CI 잡 시간 제한(15분)보다 먼저 끝내, 멈춘 대도 실패 보고서를 남기게 한다. 평소 대마다 4분 안팎이다
  globalTimeout: process.env.CI ? 10 * 60_000 : undefined,
  forbidOnly: Boolean(process.env.CI),
  // CI에서 우연히 한 번 실패한 테스트는 한 번 더 돌린다. 데이터 이름에 무작위 조각을 붙여 앞 시도가 남긴 데이터와 부딪치지 않는다(#242).
  // 로컬은 다시 돌리지 않아 흔들리는 테스트를 바로 알아챈다
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: BASE_URL,
    // GitHub Actions 러너에 이미 있는 Chrome을 쓰면 브라우저를 따로 받지 않아도 된다
    channel: "chrome",
    storageState: MEMBER_STATE_PATH,
    // 화면 전환 움직임이 끝나기를 기다리지 않고 잰다
    contextOptions: { reducedMotion: "reduce" },
    // 실패한 첫 시도의 기록을 남긴다. 다시 돌 때(on-first-retry)만 기록하면, 다시 돌아 통과한 테스트는 실패한 모습이 남지 않는다
    trace: "retain-on-first-failure",
  },
  projects: [
    // 기기 프로젝트가 모두 이 프로젝트에 기대므로, 그 테스트가 다 끝나야 teardown(공유 데이터 스펙)이 돈다.
    // 공유 데이터 스펙을 기기 프로젝트의 dependencies로 먼저 돌리면 실패했을 때 기기 테스트가 모두 건너뛰어지고,
    // 공유 데이터 프로젝트가 기기 프로젝트에 기대게 하면 --shard가 기대는 프로젝트를 나누지 않아 기기 테스트가 전부 한 대로 몰린다.
    // 기기 테스트가 있는 대마다(CI 3대) 한 번씩 돌고, 스펙 하나만 돌려도 함께 돈다(빼려면 --no-deps)
    { name: SHARED_DATA_GATE, testMatch: [], teardown: SHARED_DATA },
    { name: IPHONE_15_PRO.name, use: IPHONE_15_PRO.use, dependencies: [SHARED_DATA_GATE], testIgnore: toSpecGlobs(SHARED_DATA_SPECS) },
    {
      name: IPHONE_17.name,
      use: IPHONE_17.use,
      dependencies: [SHARED_DATA_GATE],
      testIgnore: toSpecGlobs(SHARED_DATA_SPECS),
      // 평소에는 크기·배치를 재는 스펙만 돌린다. main에 머지될 때는 전체를 돌려 놓친 차이를 잡는다(#194)
      ...(isAllDevicesRun(process.env.E2E_ALL_DEVICES) ? {} : { testMatch: toSpecGlobs(DEVICE_SIZE_SPECS) }),
    },
    { name: SHARED_DATA, testMatch: toSpecGlobs(SHARED_DATA_SPECS) },
  ],
  webServer: {
    // 다른 워크트리의 실행과 로컬 Supabase·3100번 포트를 함께 쓰므로, 빌드하기 전에 실행 잠금을 잡고 다른 실행이 있으면 멈춘다(#243)
    command: `node e2e/web-server.mts ${new URL(BASE_URL).port}`,
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
