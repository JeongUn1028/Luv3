"use client";

import { useTransition, type ReactElement } from "react";

interface RetryButtonProps {
  /** 화면을 다시 불러와 그린다 */
  onRetry: () => void;
}

/**
 * 안내 화면의 "다시 시도" 버튼. 다시 불러오는 동안 눌렸다는 것을 보여 주고 다시 누를 수 없게 한다.
 *
 * @example <RetryButton onRetry={() => router.refresh()} />
 */
export const RetryButton = ({ onRetry }: RetryButtonProps): ReactElement => {
  const [isPending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => onRetry())}
      className="h-[51px] w-full rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
    >
      {isPending ? "다시 시도하는 중…" : "다시 시도"}
    </button>
  );
};
