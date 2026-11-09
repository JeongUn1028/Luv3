"use client";

import type { ReactElement } from "react";
import { RetryButton } from "@/components/RetryButton";
import { getRetryMessage, shouldFlashRetryMessage } from "@/lib/load-retry";
import { useRefreshRetry } from "@/lib/navigation/use-retry";

interface LoadErrorMessageProps {
  /** 조회 오류의 문구. 예: "기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." */
  message: string;
}

/**
 * 머리글이나 하단 탭이 그대로 있는 화면에서 내용 자리에 보여 주는 조회 실패 문구와 다시 시도 버튼.
 * 주소창과 새로고침이 없는 홈 화면 앱에서도 다른 화면에 다녀오지 않고 그 자리에서 다시 불러올 수 있게 한다(#139).
 *
 * @example <LoadErrorMessage message={tiles.message} />
 */
export const LoadErrorMessage = ({ message }: LoadErrorMessageProps): ReactElement => {
  const { isPending, failedCount, retry } = useRefreshRetry();

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-4 py-12 text-center">
      {/* role="alert"는 내용이 바뀌어야 다시 읽으므로, 다시 시도가 실패할 때마다 새로 그린다. 두 줄이 되면 마지막 낱말만 넘어가지 않게 줄 길이를 맞춘다 */}
      <p
        key={failedCount}
        role="alert"
        className={`text-[13px] text-balance text-ink-sub ${shouldFlashRetryMessage(failedCount) ? "retry-failed-flash" : ""}`}
      >
        {getRetryMessage(message, failedCount)}
      </p>
      {/* 화면마다 바깥 여백이 달라 폭을 정해 둔다. 머리글·하단 탭이 있는 화면 안의 버튼이라 안내 화면보다 좁게 둔다 */}
      <div className="flex w-full max-w-60 flex-col gap-2.5">
        <RetryButton isPending={isPending} onRetry={retry} />
      </div>
    </div>
  );
};
