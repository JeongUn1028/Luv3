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
  "screen-fit",
  "startup-image",
  "startup-splash",
  "tap-target",
] as const;

/**
 * `E2E_ALL_DEVICES` 값으로 두 기기 전체를 돌리는지 정한다. CI는 main에 push될 때 켠다.
 *
 * @example isAllDevicesRun(process.env.E2E_ALL_DEVICES)
 */
export const isAllDevicesRun = (allDevices: string | undefined): boolean => allDevices === "1";
