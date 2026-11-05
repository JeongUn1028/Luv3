"use client";

import { useOffline } from "next/offline";
import { useTransition, type ReactElement } from "react";
import { STATUS_LINK_CLASS_NAME, StatusScreen } from "@/components/StatusScreen";
import { HOME_PATH } from "@/lib/auth/paths";

interface ErrorScreenProps {
  /** 화면을 다시 불러와 그린다 */
  onRetry: () => void;
}

/**
 * 예상 못 한 오류 화면. 오류 원문은 내부 정보가 섞일 수 있어 보여 주지 않는다.
 *
 * @example <ErrorScreen onRetry={retry} />
 */
export const ErrorScreen = ({ onRetry }: ErrorScreenProps): ReactElement => {
  const [isPending, startTransition] = useTransition();
  const isOffline = useOffline();

  return (
    <StatusScreen title="문제가 생겼어요" description="잠시 후 다시 시도해 주세요." isAlert>
      <button
        type="button"
        disabled={isPending}
        onClick={() => startTransition(() => onRetry())}
        className="h-[51px] w-full rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
      >
        {isPending ? "다시 시도하는 중…" : "다시 시도"}
      </button>
      {/* 화면 전환 링크는 홈에서 난 오류를 지우지 못하고 옛 JS 때문에 난 오류도 고치지 못해, 문서를 새로 받는다. 끊긴 동안에는 문서를 받지 못해 브라우저 오류 화면으로 바뀌므로 옮기지 않는다 */}
      <a
        href={HOME_PATH}
        onClick={(event) => {
          if (isOffline) event.preventDefault();
        }}
        className={STATUS_LINK_CLASS_NAME}
      >
        홈으로
      </a>
    </StatusScreen>
  );
};
