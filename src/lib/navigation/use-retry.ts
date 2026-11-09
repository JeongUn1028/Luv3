import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { INITIAL_RETRY_PROGRESS, updateRetryProgress } from "@/lib/load-retry";
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
 * 다시 불러온 화면이 성공하면 이 훅을 쓰는 화면이 사라지므로, 끝난 뒤에도 남아 있으면 실패로 센다.
 *
 * @example const { isPending, failedCount, retry } = useRetry(onRetry);
 */
export const useRetry = (onRetry: () => void): RetryState => {
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState(INITIAL_RETRY_PROGRESS);

  // 다시 불러오기가 끝난 것을 그리는 중에 바로 반영한다(이펙트를 쓰면 바뀌기 전 문구가 한 번 더 그려진다)
  const nextProgress = updateRetryProgress(progress, isPending);
  if (nextProgress !== progress) setProgress(nextProgress);

  return {
    isPending,
    failedCount: nextProgress.failedCount,
    retry: () => startTransition(() => onRetry()),
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
