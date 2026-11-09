/** 다시 시도가 또 실패했을 때 처음 문구 대신 보여 주는 문구 */
export const RETRY_FAILED_MESSAGE = "다시 시도했지만 불러오지 못했어요. 잠시 후 다시 시도해 주세요.";

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
