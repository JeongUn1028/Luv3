import type { ReactElement } from "react";

interface ScreenMessageProps {
  message: string;
  /** 오류처럼 바로 읽혀야 하는 문구면 `alert` */
  role?: "alert";
}

/**
 * 머리글이나 하단 탭이 그대로 있는 화면에서 내용 자리에 보여 주는 문구.
 *
 * @example <ScreenMessage message="아직 지도에 표시할 기록이 없어요." />
 */
export const ScreenMessage = ({ message, role }: ScreenMessageProps): ReactElement => (
  <div className="flex flex-1 items-center justify-center px-4 py-12 text-center">
    <p role={role} className="text-[13px] text-ink-sub">
      {message}
    </p>
  </div>
);

/**
 * 머리글이나 하단 탭이 그대로 있는 화면에서 내용 자리에 보여 주는 조회 실패 문구.
 *
 * @example <LoadErrorMessage message={tiles.message} />
 */
export const LoadErrorMessage = ({ message }: Pick<ScreenMessageProps, "message">): ReactElement => <ScreenMessage message={message} role="alert" />;
