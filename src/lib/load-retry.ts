/** 다시 시도가 또 실패했을 때 처음 문구 대신 보여 주는 문구 */
export const RETRY_FAILED_MESSAGE = "다시 시도했지만 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

/** 조회 실패 화면에서 다시 시도한 흐름 */
export interface RetryProgress {
  /** 지난번에 그릴 때 다시 불러오는 중이었는지 */
  wasPending: boolean;
  /** 다시 시도했는데 또 실패한 횟수 */
  failedCount: number;
}

export const INITIAL_RETRY_PROGRESS: RetryProgress = { wasPending: false, failedCount: 0 };

/**
 * 다시 불러오는 상태가 바뀔 때 실패 횟수를 센다. 다시 불러온 화면이 성공하면 조회 실패 화면은 내용으로 바뀌어 사라지므로,
 * 다시 불러오기가 끝났는데도 이 화면이 남아 있으면 또 실패한 것이다. 상태가 그대로면 같은 값을 돌려준다.
 *
 * @example const next = updateRetryProgress(progress, isPending); if (next !== progress) setProgress(next);
 */
export const updateRetryProgress = (progress: RetryProgress, isPending: boolean): RetryProgress => {
  if (progress.wasPending === isPending) return progress;
  return { wasPending: isPending, failedCount: isPending ? progress.failedCount : progress.failedCount + 1 };
};

/**
 * 실패 횟수에 맞는 문구. 한 번이라도 다시 시도가 실패했으면 다시 시도했다는 것이 보이는 문구로 바꾼다.
 *
 * @example getRetryMessage("잠시 후 다시 시도해 주세요.", failedCount)
 */
export const getRetryMessage = (message: string, failedCount: number): string => (failedCount > 0 ? RETRY_FAILED_MESSAGE : message);

/**
 * 문구가 그대로인 두 번째 실패부터는 바뀐 것이 없어 보이므로, 문구를 짧게 다시 나타나게 해 실패했다는 것을 보여 준다.
 *
 * @example className={shouldFlashRetryMessage(failedCount) ? "retry-failed-flash" : ""}
 */
export const shouldFlashRetryMessage = (failedCount: number): boolean => failedCount >= 2;
