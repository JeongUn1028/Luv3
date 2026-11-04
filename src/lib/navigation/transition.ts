/** 더 깊은 화면으로 들어가는 이동(목록 → 상세, 작성 화면 열기) */
export const FORWARD_TRANSITION = ["nav-forward"];
/** 위 화면으로 돌아가는 이동(뒤로 버튼, 저장·삭제 뒤) */
export const BACK_TRANSITION = ["nav-back"];
/** 앞뒤 관계가 없는 탭끼리의 이동 */
export const TAB_TRANSITION = ["nav-tab"];

/**
 * 머리글·내용 영역의 움직임. 이동 종류별 CSS 클래스 이름으로, 스타일은 `globals.css`에 있다.
 * 종류가 없는 이동(브라우저 뒤로 가기, iOS 가장자리 밀기, 새로고침)은 움직이지 않는다. iOS가 밀기 동작을 스스로 그리기 때문이다.
 *
 * @example <ViewTransition enter={SCREEN_MOTION} exit={SCREEN_MOTION} default="none">…</ViewTransition>
 */
export const SCREEN_MOTION = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  "nav-tab": "nav-tab",
  default: "none",
};

/**
 * 하단 탭의 움직임. 상세로 들어갈 때는 화면과 함께 밀리고, 탭끼리 옮길 때는 깜빡이지 않게 그대로 둔다.
 *
 * @example <ViewTransition enter={SLIDE_MOTION} exit={SLIDE_MOTION} default="none">…</ViewTransition>
 */
export const SLIDE_MOTION = {
  "nav-forward": "nav-forward",
  "nav-back": "nav-back",
  default: "none",
};
