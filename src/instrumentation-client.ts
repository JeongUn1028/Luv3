import { addTransitionType } from "react";
import { claimBackMotion } from "@/lib/navigation/history-back";
import { markNavigationStart } from "@/lib/navigation/refresh-outside-form";
import { markRouterNavigation } from "@/lib/navigation/router-navigation";
import { markScreenLoaded } from "@/lib/navigation/screen-freshness";
import { BACK_TRANSITION } from "@/lib/navigation/transition";

// 처음 연 화면은 Next가 이동을 시작하지 않으므로 여기서 적는다
markScreenLoaded(window.location.href, window.location.href);

// iOS Safari는 터치 리스너가 하나도 없으면 :active를 그리지 않아 누름 반응이 보이지 않는다(#175)
document.addEventListener("touchstart", () => undefined, { passive: true });

/**
 * 브라우저 뒤로 가기는 Next가 이동을 시작해 움직임 종류를 넘길 곳이 없다. 이 함수는 그 이동 안에서 불리므로 여기서 붙인다.
 * 뒤로 버튼으로 시작한 이동에만 붙여, iOS가 스스로 그리는 가장자리 밀기와 겹치지 않게 한다.
 */
export const onRouterTransitionStart = (url: string, navigationType: "push" | "replace" | "traverse"): void => {
  markNavigationStart(url, window.location.href);
  markRouterNavigation(navigationType);
  if (navigationType !== "traverse") {
    // 링크로 옮긴 화면은 서버에서 새로 받는다. 되돌아간 화면은 숨겨 둔 그대로라 HistoryReturn이 판단한다
    markScreenLoaded(url, window.location.href);
    return;
  }
  if (claimBackMotion()) BACK_TRANSITION.forEach(addTransitionType);
};
