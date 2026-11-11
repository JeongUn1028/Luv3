/**
 * Playwright가 스펙으로 찾는 파일 끝 이름(`playwright.config.ts`의 `testMatch`). 아래 스펙 이름 목록은 이 끝 이름을 뺀 것이다.
 * 설정이 이 파일을 읽으므로 여기에 둔다(`spec-files.ts`는 `import.meta`를 써서 Playwright 설정에서 읽지 못한다).
 */
export const SPEC_SUFFIX = ".spec.ts";

/**
 * 평소에도 두 기기에서 모두 돌리는 스펙(파일 이름에서 `.spec.ts`를 뺀 것).
 * 두 대상 기기는 폭 9px, 높이 22px, 위 safe-area 3px만 달라서 크기·배치를 재는 스펙에서만 결과가 갈린다.
 * 나머지는 폭과 높이가 더 좁은 아이폰 15 Pro에서만 돌리고, main에 머지될 때(`E2E_ALL_DEVICES=1`) 두 기기 전체를 돌린다(#194).
 * 기기의 `safeArea`를 읽는 스펙은 여기에 넣어야 한다(`devices.test.ts`가 검사한다).
 */
export const DEVICE_SIZE_SPECS = [
  "author-tag",
  "date-picker",
  "home-skeleton",
  "home-upcoming",
  "nickname-change",
  "offline",
  "record-comments",
  "screen-fit",
  "startup-image",
  "startup-splash",
  "tap-target",
] as const;

// 이 앱은 아이폰 홈 화면 앱으로 쓴다. 두 대상 기기의 화면과 safe-area로 잰다
const createDeviceUse = (width: number, height: number, safeAreaTop: number) => ({
  viewport: { width, height },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  safeArea: { top: safeAreaTop, bottom: 34 },
});

/**
 * 두 대상 기기. Playwright 기기 프로젝트와, 맨 마지막에 따로 도는 공유 데이터 스펙(`SHARED_DATA_SPECS`)이 같은 값을 쓴다.
 *
 * @example test.use(TARGET_DEVICES[0].use)
 */
export const TARGET_DEVICES = [
  { name: "iphone-15-pro", use: createDeviceUse(393, 852, 59) },
  { name: "iphone-17", use: createDeviceUse(402, 874, 62) },
] as const;

/**
 * 나란히 도는 다른 스펙과 섞이면 흔들리는 스펙(파일 이름에서 `.spec.ts`를 뺀 것). 기기 프로젝트에서 빼고 다른 테스트가 모두 끝난 뒤 따로 돌린다.
 * - 두 사람이 하나를 함께 쓰는 데이터(커플 사진)를 실제로 바꿔, 그 데이터를 읽는 다른 스펙을 깨뜨린다(#258)
 * - 모든 기록의 판 번호가 그대로일 때의 동작을 본다. 다른 스펙이 기록을 쓰면 판 번호가 바뀐다(#274)
 * 두 기기 크기는 스펙 안에서 `TARGET_DEVICES`로 차례로 돌린다.
 */
export const SHARED_DATA_SPECS = ["couple-photo-change", "record-pages-refresh"] as const;

/**
 * `E2E_ALL_DEVICES` 값으로 두 기기 전체를 돌리는지 정한다. CI는 main에 push될 때 켠다.
 *
 * @example isAllDevicesRun(process.env.E2E_ALL_DEVICES)
 */
export const isAllDevicesRun = (allDevices: string | undefined): boolean => allDevices === "1";
