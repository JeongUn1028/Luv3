import type { ReactElement } from "react";

interface ScreenMessageProps {
  message: string;
}

/**
 * 머리글이나 하단 탭이 그대로 있는 화면에서 내용 자리에 보여 주는 문구. 조회 실패는 다시 시도가 있는 `LoadErrorMessage`를 쓴다.
 *
 * @example <ScreenMessage message="아직 지도에 표시할 기록이 없어요." />
 */
export const ScreenMessage = ({ message }: ScreenMessageProps): ReactElement => (
  <div className="flex flex-1 items-center justify-center px-4 py-12 text-center">
    <p className="text-[13px] text-ink-sub">{message}</p>
  </div>
);
