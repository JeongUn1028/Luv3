import { useRef } from "react";
import { useResetOnHide } from "./use-reset-on-hide";

/**
 * 경고 창에서 "나가기"를 고른 폼을 화면이 숨겨질 때 처음 상태로 되돌린다(#284).
 * 지나온 화면은 Activity로 숨겨져 상태를 그대로 가지므로, 되돌리지 않으면 다시 열 때 버리기로 한 내용이 남는다.
 * 고르는 순간이 아니라 숨겨질 때 되돌려, 나가는 동안 빈 폼이 잠깐 보이지 않게 한다.
 * iOS 가장자리 밀기·브라우저 뒤로 가기처럼 묻지 않고 나간 경우는 버리기로 한 것이 아니라 그대로 둔다.
 * 고른 뒤 이동이 일어나지 않아(두 번 누름 막기 등) 폼에서 계속 쓰면 버리지 않는다. `content`가 고를 때와 같을 때만 되돌린다.
 *
 * @example
 * const discardOnLeave = useDiscardOnLeave({ content: draft, reset: () => resetForm(createEmptyDraft()) });
 * <ScreenHeader back={{ href, shouldConfirmLeave, onConfirmLeave: discardOnLeave }} />
 */
export const useDiscardOnLeave = <Content>({ content, reset }: { content: Content; reset: () => void }): (() => void) => {
  // 버리기로 고를 때의 내용. 고르지 않았으면 undefined
  const discardedRef = useRef<{ content: Content }>(undefined);
  useResetOnHide(() => {
    const discarded = discardedRef.current;
    discardedRef.current = undefined;
    if (discarded && Object.is(discarded.content, content)) reset();
  });
  return () => {
    discardedRef.current = { content };
  };
};
