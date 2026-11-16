"use client";

import type { ReactElement } from "react";
import { OfflineHint } from "@/components/OfflineHint";
import { useOfflineBlock } from "@/lib/use-offline-block";

interface RetryButtonProps {
  /** 다시 불러오는 중인지(`useRetry`) */
  isPending: boolean;
  /** 화면을 다시 불러와 그린다(`useRetry`의 `retry`) */
  onRetry: () => void;
}

/**
 * 조회 실패 화면의 "다시 시도" 버튼. 다시 불러오는 동안 눌렸다는 것을 보여 주고 다시 누를 수 없게 한다.
 * 끊긴 채로 누르면 연결될 때까지 기다리며 그동안 다른 링크도 제자리에 머무르므로, 끊긴 동안에는 누를 수 없게 하고 까닭을 알린다(#139, `useOfflineBlock`).
 * 다시 불러오는 중에도 초점을 지키려고 `disabled` 대신 `aria-disabled`로 막는다.
 *
 * @example
 * const { isPending, retry } = useRefreshRetry();
 * <RetryButton isPending={isPending} onRetry={retry} />
 */
export const RetryButton = ({ isPending, onRetry }: RetryButtonProps): ReactElement => {
  // 다시 시도하는 중에 끊기면 그 시도가 연결을 기다리는 중이므로 다시 누르라는 안내는 보여 주지 않는다
  const { isBlocked, hintId } = useOfflineBlock(isPending);
  const isDisabled = isPending || isBlocked;

  return (
    <>
      <button
        type="button"
        aria-disabled={isDisabled}
        aria-describedby={isBlocked ? hintId : undefined}
        onClick={() => {
          if (!isDisabled) onRetry();
        }}
        className="press-wide h-[51px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background aria-disabled:pointer-events-none aria-disabled:opacity-50"
      >
        {isPending ? "다시 시도하는 중…" : "다시 시도"}
      </button>
      <OfflineHint id={hintId} isShown={isBlocked}>
        연결되면 다시 시도할 수 있어요
      </OfflineHint>
    </>
  );
};
