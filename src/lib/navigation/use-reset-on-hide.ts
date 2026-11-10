import { useEffectEvent, useLayoutEffect } from "react";

/**
 * 화면이 숨겨질 때 `reset`을 부른다. 앱은 지나온 화면을 Activity로 숨겨 상태를 그대로 두므로,
 * 지난 작업의 실패 문구가 한참 뒤 돌아왔을 때도 남아 방금 일어난 일처럼 보인다.
 * 숨겨진 뒤에 끝난 작업의 실패는 아직 보지 못한 결과라 지우지 않는다(돌아오면 보인다).
 *
 * @example useResetOnHide(() => setMessage(undefined));
 */
export const useResetOnHide = (reset: () => void): void => {
  const onHide = useEffectEvent(reset);
  useLayoutEffect(() => () => onHide(), []);
};
