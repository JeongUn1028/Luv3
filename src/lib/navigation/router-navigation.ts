/** 앱 안 이동 하나. `id`는 이동마다 1씩 늘고, 되돌아가기(브라우저 뒤로 가기·뒤로 버튼)인지 함께 적는다 */
export interface RouterNavigation {
  id: number;
  isTraverse: boolean;
}

// 처음 연 화면은 이동이 없었던 것으로 친다
let lastNavigation: RouterNavigation = { id: 0, isTraverse: false };

/**
 * 앱 안 이동이 시작됐다고 적는다. Next가 이동을 시작할 때 부른다(`onRouterTransitionStart`).
 *
 * @example markRouterNavigation("push")
 */
export const markRouterNavigation = (navigationType: "push" | "replace" | "traverse"): void => {
  lastNavigation = { id: lastNavigation.id + 1, isTraverse: navigationType === "traverse" };
};

/**
 * 마지막으로 시작된 앱 안 이동.
 *
 * @example const { id } = getLastRouterNavigation()
 */
export const getLastRouterNavigation = (): RouterNavigation => lastNavigation;

/**
 * 숨겨 두었던 화면이 링크로 다시 열렸는지 가른다. 지난번 보였을 때와 다른 이동이고 되돌아가기가 아니면 링크(push·replace)로 연 것이다.
 * 되돌아가기면 보던 그대로 두는 게 맞고, 처음 그린 화면(`seenId`가 undefined)은 이미 주소대로 그렸다.
 *
 * @example if (isReopenedByLink(seenId, getLastRouterNavigation())) reset()
 */
export const isReopenedByLink = (seenId: number | undefined, navigation: RouterNavigation): boolean =>
  seenId !== undefined && seenId !== navigation.id && !navigation.isTraverse;
