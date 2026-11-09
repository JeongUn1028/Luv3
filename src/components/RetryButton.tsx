"use client";

import { useOffline } from "next/offline";
import { useId, type ReactElement } from "react";

interface RetryButtonProps {
  /** 다시 불러오는 중인지(`useRetry`) */
  isPending: boolean;
  /** 화면을 다시 불러와 그린다(`useRetry`의 `retry`) */
  onRetry: () => void;
}

/**
 * 조회 실패 화면의 "다시 시도" 버튼. 다시 불러오는 동안 눌렸다는 것을 보여 주고 다시 누를 수 없게 한다.
 * 끊긴 채로 누르면 연결될 때까지 기다리며 그동안 다른 링크도 제자리에 머무르므로, 끊긴 동안에는 누를 수 없게 하고 까닭을 알린다(#139).
 *
 * @example
 * const { isPending, retry } = useRefreshRetry();
 * <RetryButton isPending={isPending} onRetry={retry} />
 */
export const RetryButton = ({ isPending, onRetry }: RetryButtonProps): ReactElement => {
  const isOffline = useOffline();
  const hintId = useId();

  return (
    <>
      <button
        type="button"
        disabled={isPending || isOffline}
        aria-describedby={isOffline ? hintId : undefined}
        onClick={onRetry}
        className="press-wide h-[51px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
      >
        {isPending ? "다시 시도하는 중…" : "다시 시도"}
      </button>
      {isOffline && (
        <p id={hintId} className="text-center text-[12px] text-ink-sub">
          연결되면 다시 시도할 수 있어요
        </p>
      )}
    </>
  );
};
