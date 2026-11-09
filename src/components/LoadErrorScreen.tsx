"use client";

import type { ReactElement } from "react";
import { RetryButton } from "@/components/RetryButton";
import { StatusLink, StatusScreen } from "@/components/StatusScreen";
import { useRefreshRetry } from "@/lib/navigation/use-retry";

interface LoadErrorScreenProps {
  /** 무엇을 못 불러왔는지. 예: "일정을 불러오지 못했어요" */
  title: string;
  /** 돌아갈 목록 주소 */
  backHref: string;
  /** 돌아가는 링크 문구 */
  backLabel: string;
}

/**
 * 머리글 없는 화면(고치기 화면)에서 조회가 실패했을 때 내용 대신 보여 주는 화면.
 * 주소창과 뒤로 버튼이 없는 홈 화면 앱에서도 다시 시도하거나 빠져나갈 수 있게 한다.
 *
 * @example <LoadErrorScreen title="일정을 불러오지 못했어요" backHref={CALENDAR_PATH} backLabel="캘린더로" />
 */
export const LoadErrorScreen = ({ title, backHref, backLabel }: LoadErrorScreenProps): ReactElement => {
  const { isPending, failedCount, retry } = useRefreshRetry();

  return (
    <StatusScreen title={title} description="잠시 후 다시 시도해 주세요." isAlert failedRetryCount={failedCount}>
      <RetryButton isPending={isPending} onRetry={retry} />
      <StatusLink href={backHref}>{backLabel}</StatusLink>
    </StatusScreen>
  );
};
