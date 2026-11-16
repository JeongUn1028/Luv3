import type { MouseEvent, RefObject } from "react";

/** globals.css의 modal-sheet-out 시간 */
const CLOSE_MOTION_MS = 150;
const CLOSING_ATTRIBUTE = "data-closing";

type CloseTimerRef = RefObject<ReturnType<typeof setTimeout> | undefined>;

/**
 * 창이 움직이며 닫히는 중인지.
 *
 * @example isClosingDialog(dialog) // 닫기를 누른 뒤 150ms 동안 true
 */
export const isClosingDialog = (dialog: HTMLDialogElement): boolean => dialog.hasAttribute(CLOSING_ATTRIBUTE);

/**
 * 닫히는 중인 창을 멈추고 다시 누를 수 있게 한다. 다시 열거나 다 닫혔을 때 부른다.
 *
 * @example stopClosing(dialog, closeTimerRef)
 */
export const stopClosing = (dialog: HTMLDialogElement, timerRef: CloseTimerRef): void => {
  clearTimeout(timerRef.current);
  dialog.removeAttribute(CLOSING_ATTRIBUTE);
  dialog.inert = false;
};

/**
 * 움직임(globals.css의 modal-sheet-out)이 끝난 뒤 창을 닫는다. 움직임을 줄이는 설정이면 바로 닫는다.
 * animationend를 기다리지 않는다. 아이폰 Safari에서 신호가 오지 않아 창이 앱을 막는 일이 없게 시간으로만 닫는다
 *
 * @example closeWithMotion(dialog, closeTimerRef)
 */
export const closeWithMotion = (dialog: HTMLDialogElement, timerRef: CloseTimerRef): void => {
  if (!dialog.open || isClosingDialog(dialog)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    dialog.close();
    return;
  }
  dialog.setAttribute(CLOSING_ATTRIBUTE, "");
  // 닫히는 동안 뒤늦은 누름이나 Enter가 취소한 삭제를 실행하지 않게 막는다.
  // inert는 초점을 다음 그리기 때에야 빼므로, 그 사이의 Enter가 버튼에 닿지 않게 초점을 바로 뺀다. 닫으면 브라우저가 연 버튼으로 되돌린다
  if (document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement)) document.activeElement.blur();
  dialog.inert = true;
  timerRef.current = setTimeout(() => dialog.close(), CLOSE_MOTION_MS);
};

/**
 * 창 바깥(뒤 배경)을 눌렀는지.
 * 키보드로 누른 click은 좌표가 없어(detail 0) 바깥을 누른 것으로 보지 않는다. 창 안쪽 여백은 dialog 자신이 눌려도 사각형 안이다
 *
 * @example if (isOutsideClick(event)) closeWithMotion(event.currentTarget, closeTimerRef)
 */
export const isOutsideClick = ({ currentTarget, target, detail, clientX, clientY }: MouseEvent<HTMLDialogElement>): boolean => {
  if (target !== currentTarget || detail === 0) return false;
  const { left, right, top, bottom } = currentTarget.getBoundingClientRect();
  return clientX < left || clientX > right || clientY < top || clientY > bottom;
};
