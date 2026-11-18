// 숨겨진 화면(Activity)은 layout effect가 정리되어 빠지므로, 지금 보이는 탭 화면만 들어 있다
const refreshHandlers = new Map<string, () => void>();

/**
 * 탭 이름으로 그 탭 화면을 새로 받는 동작을 등록한다(#351). 돌려준 함수는 등록을 지운다.
 * 받는 동안 표시를 그리는 쪽(`TabRefreshIndicator`)이 등록하고, 하단 탭이 부른다.
 *
 * @example useLayoutEffect(() => registerTabRefresh("todos", refresh), [refresh]);
 */
export const registerTabRefresh = (tab: string, handler: () => void): (() => void) => {
  refreshHandlers.set(tab, handler);
  return () => {
    if (refreshHandlers.get(tab) === handler) refreshHandlers.delete(tab);
  };
};

/**
 * 지금 보이는 그 탭 화면을 새로 받는다. 보이는 화면이 없으면 아무것도 하지 않는다.
 *
 * @example if (scrollAreaToTop("todos")) refreshTab("todos");
 */
export const refreshTab = (tab: string): void => {
  refreshHandlers.get(tab)?.();
};
