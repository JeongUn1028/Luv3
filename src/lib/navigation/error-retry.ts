/**
 * 오류 화면이 떨어진 뒤 이만큼 다시 그려지지 않으면 다시 시도가 성공한 것으로 보고 센 것을 지운다.
 * 다시 불러오는 동안에는 오류 화면 대신 불러오는 뼈대가 잠깐 보였다가 다시 실패할 수 있어 바로 지우지 않는다.
 */
export const ERROR_RETRY_RESET_DELAY_MS = 10_000;

/** 오류 화면(`error.tsx`)의 다시 시도가 또 실패한 횟수를 화면 밖에서 센다 */
export interface ErrorRetryTracker {
  /** 다시 시도를 누를 때 부른다 */
  start: () => void;
  /** 오류 화면을 처음 그릴 때 실패 횟수를 읽는다. 다시 시도 직후 새로 그려진 화면이면 또 실패한 것이다 */
  readFailedCount: () => number;
  /** 오류 화면이 화면에 붙은 뒤 그 화면의 실패 횟수로 부른다 */
  attach: (failedCount: number) => void;
  /** 오류 화면이 사라질 때 부른다. 정한 시간 안에 다시 붙는 오류 화면이 없으면 다시 시도가 성공한 것이라 센 것을 지운다 */
  detach: () => void;
}

/**
 * 오류 화면의 다시 시도 횟수를 세는 저장소를 만든다.
 * 다시 시도가 또 실패하면 React가 오류 경계의 대체 화면을 새로 그려 화면 안의 상태가 사라지므로(#139) 밖에 둔다.
 *
 * @param schedule 오류 화면이 떨어진 뒤 다시 붙었는지 확인할 일을 미룬다. 테스트에서만 넘긴다
 * @example const tracker = createErrorRetryTracker()
 */
export const createErrorRetryTracker = (
  schedule: (task: () => void, delayMs: number) => void = (task, delayMs) => setTimeout(task, delayMs),
): ErrorRetryTracker => {
  let isRetrying = false;
  let failedCount = 0;
  let attachedCount = 0;
  // 붙거나 떨어질 때마다 바꿔, 예전에 예약한 지우기가 나중 다시 시도의 뼈대 사이에 돌지 않게 한다
  let generation = 0;

  return {
    start: () => {
      isRetrying = true;
    },
    readFailedCount: () => (isRetrying ? failedCount + 1 : 0),
    attach: (count) => {
      attachedCount += 1;
      generation += 1;
      failedCount = count;
      isRetrying = false;
    },
    detach: () => {
      attachedCount -= 1;
      generation += 1;
      const detachedGeneration = generation;
      schedule(() => {
        if (attachedCount > 0 || generation !== detachedGeneration) return;
        isRetrying = false;
        failedCount = 0;
      }, ERROR_RETRY_RESET_DELAY_MS);
    },
  };
};

/** 앱 전체에서 함께 쓰는 오류 화면 다시 시도 저장소 */
export const errorRetryTracker = createErrorRetryTracker();
