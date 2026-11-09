/**
 * 오류 화면이 떨어진 뒤 이만큼 다시 그려지지 않으면 다시 시도가 성공한 것으로 보고 센 것을 지운다.
 * 다시 불러오는 동안에는 오류 화면 대신 불러오는 뼈대가 잠깐 보였다가 다시 실패할 수 있어 바로 지우지 않는다.
 */
export const ERROR_RETRY_RESET_DELAY_MS = 10_000;

/** 정한 시간 뒤에 일을 돌리고, 돌려준 함수로 취소한다 */
export type ScheduleReset = (task: () => void, delayMs: number) => () => void;

/** 오류 화면(`error.tsx`)의 다시 시도가 또 실패한 횟수를 화면 밖에서 센다 */
export interface ErrorRetryTracker {
  /** 다시 시도를 누를 때 그 화면의 주소로 부른다 */
  start: (pathname: string) => void;
  /** 오류 화면을 처음 그릴 때 실패 횟수를 읽는다. 같은 주소에서 다시 시도한 직후 새로 그려진 화면이면 또 실패한 것이다 */
  readFailedCount: (pathname: string) => number;
  /** 오류 화면이 화면에 붙은 뒤 그 화면의 실패 횟수로 부른다 */
  attach: (failedCount: number) => void;
  /** 오류 화면이 사라질 때 부른다. 정한 시간 안에 다시 붙는 오류 화면이 없으면 다시 시도가 성공한 것이라 센 것을 지운다 */
  detach: () => void;
}

const scheduleWithTimer: ScheduleReset = (task, delayMs) => {
  const timer = setTimeout(task, delayMs);
  return () => clearTimeout(timer);
};

/**
 * 오류 화면의 다시 시도 횟수를 세는 저장소를 만든다.
 * 다시 시도가 또 실패하면 React가 오류 경계의 대체 화면을 새로 그려 화면 안의 상태가 사라지므로(#139) 밖에 둔다.
 * 다시 시도한 주소를 함께 적어, 다시 시도하는 사이 다른 화면으로 옮겨 난 오류는 처음부터 센다.
 *
 * @param schedule 오류 화면이 떨어진 뒤 다시 붙었는지 확인할 일을 미룬다. 테스트에서만 넘긴다
 * @example const tracker = createErrorRetryTracker()
 */
export const createErrorRetryTracker = (schedule: ScheduleReset = scheduleWithTimer): ErrorRetryTracker => {
  let retryingPathname: string | undefined;
  let failedCount = 0;
  let attachedCount = 0;
  let cancelReset: (() => void) | undefined;

  const clearScheduledReset = (): void => {
    cancelReset?.();
    cancelReset = undefined;
  };

  return {
    start: (pathname) => {
      retryingPathname = pathname;
    },
    readFailedCount: (pathname) => (retryingPathname === pathname ? failedCount + 1 : 0),
    attach: (count) => {
      clearScheduledReset();
      attachedCount += 1;
      failedCount = count;
      retryingPathname = undefined;
    },
    detach: () => {
      clearScheduledReset();
      attachedCount -= 1;
      if (attachedCount > 0) return;
      cancelReset = schedule(() => {
        cancelReset = undefined;
        retryingPathname = undefined;
        failedCount = 0;
      }, ERROR_RETRY_RESET_DELAY_MS);
    },
  };
};

/** 앱 전체에서 함께 쓰는 오류 화면 다시 시도 저장소 */
export const errorRetryTracker = createErrorRetryTracker();
