import type { ReactElement } from "react";

/**
 * 상태바 자리를 앱 배경색으로 덮는 고정 띠. 화면과 같은 색이라 보이지 않고, 배치와 누르기도 바꾸지 않는다.
 * iOS 26은 상태바 아래까지 그리는 홈 화면 앱의 맨 위를 흐리게 그리는데, 맨 위에 고정된 단색 요소가 있으면 그 색을 쓴다고 보고됐다(#127).
 * WebKit은 pointer-events를 무시하고 맨 위 가운데에서 가장 위에 있는 요소를 찾으므로, 누르기를 막지 않으면서 화면 내용보다 위에 둔다.
 * 끊김 안내와 위쪽 알림(z-10)은 이 띠보다 위에 놓인다.
 *
 * @example <StatusBarStrip />
 */
export const StatusBarStrip = (): ReactElement => (
  <div
    aria-hidden="true"
    data-status-bar-strip
    className="pointer-events-none fixed inset-x-0 top-0 z-1 h-[env(safe-area-inset-top)] bg-background"
  />
);
