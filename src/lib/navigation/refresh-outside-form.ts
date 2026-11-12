import { isWritingPath } from "./save-notices";
import { markAllScreensStale } from "./screen-freshness";

// 주소창은 이동이 끝나야 바뀌므로, 옮기는 중인 곳을 따로 적어 둔다
let navigatingPathname: string | undefined;

/**
 * 화면 이동을 시작할 때 가는 곳을 적는다(`instrumentation-client`의 `onRouterTransitionStart`).
 * 폼으로 옮기는 중에 저장이 끝나면 주소창은 아직 예전 화면이라, 이것 없이는 다시 불러와 막 연 폼을 새로 만든다.
 *
 * @example markNavigationStart("/todos/new", window.location.href);
 */
export const markNavigationStart = (url: string, baseUrl: string): void => {
  navigatingPathname = new URL(url, baseUrl).pathname;
};

/**
 * 지금 폼을 쓰거나 폼으로 옮기는 중인지. 주소창이 바뀌기 전이라도 가는 곳이 폼이면 true.
 *
 * @example if (isWritingNow()) return;
 */
export const isWritingNow = (): boolean => isWritingPath(navigatingPathname ?? window.location.pathname);

/**
 * 다른 화면에서 시작한 저장이 끝나 화면을 새로 받을 때 쓴다. 지금 폼을 쓰거나 폼으로 옮기는 중이면 새로 받지 않고 돌아갈 때로 미룬다(#104, #164).
 * `router.refresh()`는 보고 있는 폼을 새로 만들어 쓰던 내용을 지운다. 미루면 그 폼에서 링크로 옮길 때 서버에서 새로 받고, 뒤로 가면 HistoryReturn이 새로 받는다.
 *
 * @param refresh 새로 받는 일. 기다리는 표시가 필요하면 transition으로 감싸 넘긴다
 * @returns 지금 새로 받았는지
 * @example refreshOutsideForm(() => router.refresh());
 */
export const refreshOutsideForm = (refresh: () => void): boolean => {
  if (isWritingNow()) {
    markAllScreensStale();
    return false;
  }
  refresh();
  return true;
};
