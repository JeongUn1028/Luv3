import { useEffect, useState, useTransition } from "react";
import { errorRetryTracker } from "./error-retry";
import type { RetryState } from "./use-retry";

/**
 * 오류 화면(`error.tsx`)의 다시 시도. 다시 시도가 또 실패하면 React가 오류 화면을 새로 그리므로,
 * `useRetry`와 달리 실패 횟수를 화면 밖 저장소(`errorRetryTracker`)에서 이어 받는다(#139).
 *
 * @example const { isPending, failedCount, retry } = useErrorRetry(onRetry);
 */
export const useErrorRetry = (onRetry: () => void): RetryState => {
  const [isPending, startTransition] = useTransition();
  const [failedCount] = useState(() => errorRetryTracker.readFailedCount());

  // 화면 밖 저장소에 이 오류 화면이 붙어 있는지 맞춘다
  useEffect(() => {
    errorRetryTracker.attach(failedCount);
    return () => errorRetryTracker.detach();
  }, [failedCount]);

  return {
    isPending,
    failedCount,
    retry: () => {
      errorRetryTracker.start();
      startTransition(() => onRetry());
    },
  };
};
