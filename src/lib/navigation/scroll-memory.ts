/** 스크롤 위치를 읽고 쓰는 영역. DOM 요소가 그대로 맞는다 */
export interface Scroller {
  scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}

export interface ScrollRestorer {
  /** 스크롤 이벤트마다 부른다. 되돌리는 중이 아니면 위치를 저장한다 */
  handleScroll: () => void;
  /** 내용이 바뀔 때마다 부른다. 아직 못 되돌렸으면 다시 시도한다 */
  retry: () => void;
  /** 사용자가 영역을 만졌을 때 부른다. 되돌리기를 그만둔다 */
  cancel: () => void;
}

// 앱을 끄면 처음 위치로 돌아가도록 메모리에만 둔다
const positions = new Map<string, number>();

/**
 * 저장한 위치를 지워 다음에 열 때 맨 위에서 시작하게 한다. 맨 위에 새 항목이 생겨 그것을 보여 줘야 할 때 쓴다.
 *
 * @example forgetScrollPosition("records");
 */
export const forgetScrollPosition = (key: string, memory: Map<string, number> = positions): void => {
  memory.delete(key);
};

// 숨겨진 화면(Activity)은 layout effect가 정리되어 빠지므로, 지금 보이는 스크롤 영역만 들어 있다
const scrollToTopHandlers = new Map<string, () => void>();

/**
 * 화면 이름으로 맨 위로 올리는 동작을 등록한다. 돌려준 함수는 등록을 지운다.
 *
 * @example const unregister = registerScrollToTop("records", () => element.scrollTo({ top: 0 }));
 */
export const registerScrollToTop = (key: string, handler: () => void): (() => void) => {
  scrollToTopHandlers.set(key, handler);
  return () => {
    if (scrollToTopHandlers.get(key) === handler) scrollToTopHandlers.delete(key);
  };
};

/**
 * 지금 보이는 그 화면의 스크롤 영역을 맨 위로 올린다.
 *
 * @example scrollAreaToTop("records");
 */
export const scrollAreaToTop = (key: string): void => {
  scrollToTopHandlers.get(key)?.();
};

/**
 * 화면 이름별로 스크롤 위치를 기억하고, 다시 열면 그 위치로 되돌린다.
 * 내용은 Suspense로 늦게 올 수 있어, 저장한 위치까지 스크롤할 수 있을 때까지 기다린다.
 *
 * @example
 * const restorer = createScrollRestorer(element, "records");
 * element.addEventListener("scroll", restorer.handleScroll);
 */
export const createScrollRestorer = (
  scroller: Scroller,
  key: string,
  memory: Map<string, number> = positions,
): ScrollRestorer => {
  const target = memory.get(key) ?? 0;
  let isRestoring = target > 0;
  let appliedTop = 0;

  const retry = () => {
    if (!isRestoring) return;
    scroller.scrollTop = target;
    appliedTop = scroller.scrollTop;
    // scrollTop은 소수일 수 있지만 scrollHeight는 반올림된 값이라 1px 여유를 둔다
    if (scroller.scrollHeight - scroller.clientHeight >= target - 1) isRestoring = false;
  };

  retry();

  return {
    handleScroll: () => {
      // 목록이 짧아져 저장한 위치에 닿을 수 없어도, 우리가 옮긴 자리에서 벗어났다면 사용자가 움직인 것이다(키보드, 스크롤바 포함)
      if (isRestoring && Math.abs(scroller.scrollTop - appliedTop) <= 1) return;
      isRestoring = false;
      memory.set(key, scroller.scrollTop);
    },
    retry,
    cancel: () => {
      isRestoring = false;
    },
  };
};
