"use client";

import { useId, useImperativeHandle, useLayoutEffect, useRef, type MouseEvent, type ReactElement, type ReactNode, type Ref, type RefObject } from "react";
import { useCloseDialogOnHide } from "@/lib/navigation/use-close-dialog-on-hide";

/** 칸을 두 번 누르면 두 번째가 칸 자리에 뜬 창에 닿는다. 이 시간 안의 누름은 창이 받지 않는다 */
const DOUBLE_TAP_GUARD_MS = 300;
/** globals.css의 modal-sheet-out 시간 */
const CLOSE_MOTION_MS = 150;
const CLOSING_ATTRIBUTE = "data-closing";
const STEP_IN_CLASS_NAME = "modal-step-in";

/** 창을 쓰는 쪽이 부르는 기능. 열기·닫기를 한곳에 두어 창 움직임 같은 변경이 이 파일에서 끝나게 한다 */
export interface ModalDialogHandle {
  open: () => void;
  /** 움직임이 끝난 뒤 닫는다. `onClose`와 초점 되돌리기도 그때 일어난다 */
  close: () => void;
  /** 움직임 없이 바로 닫는다. 파일 선택처럼 창이 닫힌 뒤에 바로 이어지는 동작 앞에 쓴다 */
  closeImmediately: () => void;
  /** 닫히는 중이면 false다. 이때 `open`을 부르면 닫기를 멈추고 그대로 연다 */
  isOpen: () => boolean;
}

type CloseTimerRef = RefObject<ReturnType<typeof setTimeout> | undefined>;

const stopClosing = (dialog: HTMLDialogElement, timerRef: CloseTimerRef): void => {
  clearTimeout(timerRef.current);
  dialog.removeAttribute(CLOSING_ATTRIBUTE);
  dialog.inert = false;
};

// animationend를 기다리지 않는다. 아이폰 Safari에서 신호가 오지 않아 창이 앱을 막는 일이 없게 시간으로만 닫는다
const closeWithMotion = (dialog: HTMLDialogElement, timerRef: CloseTimerRef): void => {
  if (!dialog.open || dialog.hasAttribute(CLOSING_ATTRIBUTE)) return;
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

interface ModalDialogProps {
  ref: Ref<ModalDialogHandle>;
  title: string;
  description?: string;
  /** 작업 중이면 Esc나 바깥 누름으로 닫혀 결과를 놓치지 않게 막는다 */
  isBusy?: boolean;
  onClose?: () => void;
  /** 창 바깥을 누르면 닫는다. 닫아도 잃는 것이 없는 창에만 쓴다 */
  shouldCloseOnOutsideClick?: boolean;
  /** 열린 직후의 누름을 받지 않는다. 고르면 바로 값이 바뀌는 창이 두 번 누르기로 눌리지 않게 한다 */
  shouldGuardDoubleTap?: boolean;
  children: ReactNode;
}

// 키보드로 누른 click은 좌표가 없어(detail 0) 바깥을 누른 것으로 보지 않는다. 창 안쪽 여백은 dialog 자신이 눌려도 사각형 안이다
const isOutsideClick = ({ currentTarget, target, detail, clientX, clientY }: MouseEvent<HTMLDialogElement>): boolean => {
  if (target !== currentTarget || detail === 0) return false;
  const { left, right, top, bottom } = currentTarget.getBoundingClientRect();
  return clientX < left || clientX > right || clientY < top || clientY > bottom;
};

/**
 * 앱의 모달 창. 네이티브 `<dialog>`라 바깥 초점을 막고 Esc로 닫히며, 화면이 숨겨지면 함께 닫힌다.
 *
 * @example
 * const modalRef = useRef<ModalDialogHandle>(null);
 * <button type="button" onClick={() => modalRef.current?.open()}>삭제</button>
 * <ModalDialog ref={modalRef} title="이 기록을 지울까요?" description="되돌릴 수 없어요.">
 *   <ModalActions cancelLabel="취소" onCancel={() => modalRef.current?.close()} confirmLabel="삭제" onConfirm={handleConfirm} />
 * </ModalDialog>
 */
export const ModalDialog = ({
  ref,
  title,
  description,
  isBusy = false,
  onClose,
  shouldCloseOnOutsideClick = false,
  shouldGuardDoubleTap = false,
  children,
}: ModalDialogProps): ReactElement => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const openedAtRef = useRef(0);
  // 한 화면에 창이 여러 개 있어도 제목·설명이 서로 섞이지 않게 id를 따로 만든다
  const titleId = useId();
  const descriptionId = useId();
  // 숨겨질 때는 움직임을 기다리지 않고 바로 닫는다. 기다리는 사이 창이 앱 전체를 막는다(#155)
  useCloseDialogOnHide(dialogRef);
  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        const dialog = dialogRef.current;
        if (!dialog) return;
        openedAtRef.current = performance.now();
        stopClosing(dialog, closeTimerRef);
        dialog.showModal();
      },
      close: () => {
        if (dialogRef.current) closeWithMotion(dialogRef.current, closeTimerRef);
      },
      closeImmediately: () => dialogRef.current?.close(),
      isOpen: () => {
        const dialog = dialogRef.current;
        return dialog !== null && dialog.open && !dialog.hasAttribute(CLOSING_ATTRIBUTE);
      },
    }),
    [],
  );

  // 열려 있는 채로 제목이 바뀌면 다음 단계로 넘어간 것이다(커플 사진 메뉴 → 지우기 확인). 처음 열릴 때는 창 전체가 움직이므로 건너뛴다
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !dialogRef.current?.open) return;
    content.classList.remove(STEP_IN_CLASS_NAME);
    // 클래스를 다시 붙여도 움직임이 처음부터 돌도록 스타일을 한 번 계산시킨다
    void content.offsetWidth;
    content.classList.add(STEP_IN_CLASS_NAME);
  }, [title]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        // 브라우저가 바로 닫지 않게 하고 같은 움직임으로 닫는다. 작업 중이면 닫지 않는다
        event.preventDefault();
        if (!isBusy) closeWithMotion(event.currentTarget, closeTimerRef);
      }}
      onClose={(event) => {
        stopClosing(event.currentTarget, closeTimerRef);
        contentRef.current?.classList.remove(STEP_IN_CLASS_NAME);
        onClose?.();
      }}
      onClickCapture={(event) => {
        // 키보드 누름(detail 0)은 두 번 누르기와 상관없다
        if (shouldGuardDoubleTap && event.detail > 0 && event.timeStamp - openedAtRef.current < DOUBLE_TAP_GUARD_MS) event.stopPropagation();
      }}
      onClick={(event) => {
        // 작업 중이면 Esc와 같이 닫지 않는다. 닫힌 창에 실패 문구가 남아 결과를 놓친다
        if (shouldCloseOnOutsideClick && !isBusy && isOutsideClick(event)) closeWithMotion(event.currentTarget, closeTimerRef);
      }}
      className="modal-dialog m-auto w-[calc(100%-32px)] max-w-[360px] rounded-[14px] border border-line bg-surface p-5 text-ink backdrop:bg-background/70"
    >
      <div ref={contentRef}>
        <h2 id={titleId} className="font-display text-[17px]">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="mt-2 text-[14px] leading-[1.6] text-ink-sub">
            {description}
          </p>
        )}
        {children}
      </div>
    </dialog>
  );
};

/**
 * 창 안의 실패 문구.
 *
 * @example <ModalMessage>지우지 못했어요.</ModalMessage>
 */
export const ModalMessage = ({ children }: { children: ReactNode }): ReactElement => (
  <p role="alert" className="mt-3 text-[13px] text-accent">
    {children}
  </p>
);

interface ModalActionsBaseProps {
  cancelLabel: string;
  onCancel: () => void;
  confirmLabel: string;
  isDisabled?: boolean;
  /** 창이 열린 뒤 이 줄이 새로 나타날 때 초점을 취소 버튼으로 옮긴다 */
  shouldFocusCancel?: boolean;
}

/** 확인 버튼은 함수를 부르거나 폼을 제출한다. 둘 다 빠뜨려 눌러도 아무 일이 없는 버튼을 만들지 못하게 한다 */
type ModalActionsProps = ModalActionsBaseProps & ({ onConfirm: () => void; isSubmit?: false } | { onConfirm?: undefined; isSubmit: true });

/**
 * 창 아래쪽의 취소·확인 버튼 한 줄.
 *
 * @example <ModalActions cancelLabel="취소" onCancel={handleClose} confirmLabel="삭제" onConfirm={handleConfirm} />
 */
export const ModalActions = ({
  cancelLabel,
  onCancel,
  confirmLabel,
  onConfirm,
  isSubmit = false,
  isDisabled = false,
  shouldFocusCancel = false,
}: ModalActionsProps): ReactElement => (
  <div className="mt-5 flex gap-2">
    <button
      type="button"
      autoFocus={shouldFocusCancel}
      disabled={isDisabled}
      onClick={onCancel}
      className="press-wide h-12 flex-1 rounded-[10px] border border-line text-[15px] text-ink hover:bg-background disabled:opacity-50"
    >
      {cancelLabel}
    </button>
    <button
      type={isSubmit ? "submit" : "button"}
      disabled={isDisabled}
      onClick={onConfirm && (() => onConfirm())}
      className="press-wide h-12 flex-1 rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
    >
      {confirmLabel}
    </button>
  </div>
);
