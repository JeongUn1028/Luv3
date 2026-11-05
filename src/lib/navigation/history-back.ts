import { LOGIN_PATH } from "@/lib/auth/paths";

/** 이 파일이 쓰는 Navigation API 부분. TypeScript 기본 타입에 아직 없다 */
interface NavigationHistory {
  readonly currentEntry: { readonly index: number } | null;
  entries: () => ReadonlyArray<{ readonly url: string | null }>;
}

declare global {
  interface Window {
    navigation?: NavigationHistory;
  }
}

/** 뒤로 버튼을 누른 뒤 브라우저가 이동을 시작하기까지 기다리는 시간. 넘으면 이동이 일어나지 않은 것으로 본다 */
const BACK_MOTION_WINDOW_MS = 1000;

/** 손가락으로 두 번 누르는 간격. 첫 번째로 옮겨 간 화면의 같은 자리 버튼까지 눌려 두 칸 가는 일을 막는다 */
const DOUBLE_TAP_GUARD_MS = 400;

let backRequestedAt: number | undefined;
let lastBackAt: number | undefined;

const isPending = (now: number): boolean => backRequestedAt !== undefined && now - backRequestedAt < BACK_MOTION_WINDOW_MS;

/**
 * 뒤로 몇 칸 가면 앱 안의 이전 화면인지 찾는다. 돌아갈 곳이 없으면 `undefined`.
 * 저장한 뒤에는 폼 기록이 저장한 화면으로 바뀌어 같은 주소가 이어지므로 건너뛴다. 로그인 화면은 돌아갈 곳이 아니다.
 * 주소를 알 수 없는 기록(`null`, 브라우저가 감춘 경우)도 어디인지 모르므로 돌아갈 곳으로 치지 않는다.
 *
 * @example getBackSteps(["https://a.test/records", "https://a.test/dates/1", "https://a.test/dates/1"], 2) // 2
 */
export const getBackSteps = (entryUrls: ReadonlyArray<string | null>, currentIndex: number): number | undefined => {
  const currentUrl = entryUrls[currentIndex];
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const entryUrl = entryUrls[index];
    if (entryUrl === currentUrl) continue;
    if (entryUrl === null) return undefined;
    return new URL(entryUrl).pathname === LOGIN_PATH ? undefined : currentIndex - index;
  }
  return undefined;
};

/**
 * 앱 안에 돌아갈 화면이 있으면 브라우저 뒤로 가기로 돌아가고 `true`를 돌려준다. `false`면 호출한 쪽이 정해진 주소로 간다.
 * 기록을 읽을 수 있는 Navigation API가 없는 브라우저도 `false`라 정해진 주소로 간다.
 *
 * @example if (goBackInHistory()) event.preventDefault();
 */
export const goBackInHistory = (): boolean => {
  const { navigation } = window;
  if (!navigation?.currentEntry) return false;
  const steps = getBackSteps(
    navigation.entries().map((entry) => entry.url),
    navigation.currentEntry.index,
  );
  if (steps === undefined) return false;

  const now = Date.now();
  if (lastBackAt !== undefined && now - lastBackAt < DOUBLE_TAP_GUARD_MS) return true;
  lastBackAt = now;
  backRequestedAt = now;
  history.go(-steps);
  return true;
};

/**
 * 뒤로 버튼으로 시작한 되돌아가기를 기다리는 중인지 알려 준다. 표시는 지우지 않는다.
 *
 * @example if (isBackMotionPending()) prepareMotion();
 */
export const isBackMotionPending = (): boolean => isPending(Date.now());

/**
 * 지금 시작된 되돌아가기가 뒤로 버튼으로 시작됐는지 확인하고 표시를 지운다. iOS 가장자리 밀기와 브라우저 뒤로 가기는 `false`다.
 *
 * @example if (navigationType === "traverse" && claimBackMotion()) addTransitionType("nav-back");
 */
export const claimBackMotion = (): boolean => {
  const isRequested = isPending(Date.now());
  backRequestedAt = undefined;
  return isRequested;
};
