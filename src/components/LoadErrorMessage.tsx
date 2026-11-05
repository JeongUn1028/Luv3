import type { ReactElement } from "react";

interface LoadErrorMessageProps {
  message: string;
}

/**
 * 머리글이나 하단 탭이 그대로 있는 화면에서 내용 자리에 보여 주는 조회 실패 문구.
 *
 * @example <LoadErrorMessage message={tiles.message} />
 */
export const LoadErrorMessage = ({ message }: LoadErrorMessageProps): ReactElement => (
  <div className="flex flex-1 items-center justify-center px-4 py-12 text-center">
    <p role="alert" className="text-[13px] text-ink-sub">
      {message}
    </p>
  </div>
);
