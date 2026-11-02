/** 홈에서 옆으로 넘겨 오가는 두 페이지. 배열 순서가 화면의 왼쪽 → 오른쪽 순서다. */
export const HOME_VIEWS = ["records", "calendar"] as const;

export type HomeView = (typeof HOME_VIEWS)[number];

/** 새로고침·뒤로 가기에도 보던 페이지가 유지되도록 현재 페이지를 담는 쿼리 이름 */
export const HOME_VIEW_PARAM = "view";

/**
 * URL 쿼리 값을 홈 페이지 이름으로 바꾼다. 모르는 값이면 첫 화면(기록)으로 본다.
 *
 * @example parseHomeView("calendar") // "calendar"
 */
export const parseHomeView = (value: string | string[] | null | undefined): HomeView =>
  value === "calendar" ? "calendar" : "records";

/**
 * 페이지를 바꿀 때 쓸 쿼리 문자열을 만든다. 기록(첫 화면)이면 `view`를 지워 주소를 `/`로 둔다.
 *
 * @example buildHomeViewSearch("calendar", "?from=next") // "?from=next&view=calendar"
 */
export const buildHomeViewSearch = (view: HomeView, currentSearch: string): string => {
  const params = new URLSearchParams(currentSearch);
  if (view === "records") params.delete(HOME_VIEW_PARAM);
  else params.set(HOME_VIEW_PARAM, view);
  const search = params.toString();
  return search ? `?${search}` : "";
};

/**
 * 가로 스크롤 위치에서 지금 보이는 페이지를 고른다. 절반을 넘게 밀었으면 다음 페이지로 본다.
 *
 * @example getViewFromScroll(200, 390) // "calendar"
 */
export const getViewFromScroll = (scrollLeft: number, pageWidth: number): HomeView => {
  if (pageWidth <= 0) return "records";
  const index = Math.min(Math.max(Math.round(scrollLeft / pageWidth), 0), HOME_VIEWS.length - 1);
  return HOME_VIEWS[index];
};
