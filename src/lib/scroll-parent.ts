/**
 * 요소를 감싼 가장 가까운 세로 스크롤 영역. 화면은 문서가 아니라 안쪽 영역이 스크롤되므로(PageShell),
 * 스크롤 거리를 재는 관찰(IntersectionObserver)은 이 영역을 기준으로 삼아야 미리 부르는 거리(rootMargin)가 먹는다.
 *
 * @returns 스크롤 영역이 없으면 null(문서 기준)
 * @example new IntersectionObserver(callback, { root: findScrollParent(marker), rootMargin: "0px 0px 600px 0px" })
 */
export const findScrollParent = (element: HTMLElement): HTMLElement | null => {
  for (let parent = element.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/.test(getComputedStyle(parent).overflowY)) return parent;
  }
  return null;
};
