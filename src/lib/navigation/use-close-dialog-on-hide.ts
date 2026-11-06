import { useLayoutEffect, type RefObject } from "react";

/**
 * 화면이 숨겨지거나 사라질 때 그 화면의 모달 창을 닫는다.
 * 앱은 지나온 화면을 Activity로 숨겨 보존하는데, `showModal()`로 연 창은 함께 숨겨져도
 * 모달로 남아 문서 전체를 막는다. 그러면 화면은 멀쩡해 보여도 아무것도 눌리지 않는다.
 *
 * @example useCloseDialogOnHide(dialogRef);
 */
export const useCloseDialogOnHide = (dialogRef: RefObject<HTMLDialogElement | null>): void => {
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    return () => dialog?.close();
  }, [dialogRef]);
};
