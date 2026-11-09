import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { markAllScreensLoaded } from "./screen-freshness";

/** 조회 실패 화면의 다시 시도 상태 */
export interface RetryState {
  /** 다시 불러오는 중인지 */
  isPending: boolean;
  /** 다시 시도했는데 또 실패한 횟수 */
  failedCount: number;
  /** 다시 불러온다 */
  retry: () => void;
}

/**
 * 조회 실패 화면에서 다시 시도하고, 다시 시도가 또 실패한 횟수를 센다(#139).
 * 다시 불러온 화면이 성공하면 이 훅을 쓰는 화면이 사라지므로, 남아 있는 동안 끝난 시도는 모두 실패한 것이다.
 *
 * @example const { isPending, failedCount, retry } = useRetry(onRetry);
 */
export const useRetry = (onRetry: () => void): RetryState => {
  const [isPending, startTransition] = useTransition();
  const [attemptCount, setAttemptCount] = useState(0);

  return {
    isPending,
    // 지금 도는 시도는 아직 실패하지 않았다
    failedCount: isPending ? attemptCount - 1 : attemptCount,
    retry: () => {
      setAttemptCount((count) => count + 1);
      startTransition(() => onRetry());
    },
  };
};

/**
 * 서버에서 화면을 다시 받아 조회를 다시 하는 다시 시도.
 *
 * @example const { isPending, failedCount, retry } = useRefreshRetry();
 */
export const useRefreshRetry = (): RetryState => {
  const router = useRouter();

  return useRetry(() => {
    // router.refresh()는 숨겨 둔 화면까지 비워 돌아갈 때 Next가 새로 받으므로, 표시가 없으면 같은 요청과 사진을 두 번 받는다
    markAllScreensLoaded();
    router.refresh();
  });
};
