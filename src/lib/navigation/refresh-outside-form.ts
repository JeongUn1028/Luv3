import { isWritingPath } from "./save-notices";
import { markAllScreensStale } from "./screen-freshness";

/**
 * 다른 화면에서 시작한 저장이 끝나 화면을 새로 받을 때 쓴다. 지금 폼을 쓰는 중이면 새로 받지 않고 돌아갈 때로 미룬다(#104, #164).
 * `router.refresh()`는 보고 있는 폼을 새로 만들어 쓰던 내용을 지운다. 미루면 그 폼에서 링크로 옮길 때 서버에서 새로 받고, 뒤로 가면 HistoryReturn이 새로 받는다.
 *
 * @param refresh 새로 받는 일. 기다리는 표시가 필요하면 transition으로 감싸 넘긴다
 * @param pathname 지금 주소. 테스트에서만 넘긴다
 * @returns 지금 새로 받았는지
 * @example refreshOutsideForm(() => router.refresh());
 */
export const refreshOutsideForm = (refresh: () => void, pathname: string = window.location.pathname): boolean => {
  if (isWritingPath(pathname)) {
    markAllScreensStale();
    return false;
  }
  refresh();
  return true;
};
