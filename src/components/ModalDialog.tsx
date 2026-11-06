"use client";

import { useId, useImperativeHandle, useRef, type MouseEvent, type ReactElement, type ReactNode, type Ref } from "react";
import { useCloseDialogOnHide } from "@/lib/navigation/use-close-dialog-on-hide";

/** 칸을 두 번 누르면 두 번째가 칸 자리에 뜬 창에 닿는다. 이 시간 안의 누름은 창이 받지 않는다 */
const DOUBLE_TAP_GUARD_MS = 300;

/** 창을 쓰는 쪽이 부르는 기능. 열기·닫기를 한곳에 두어 창 움직임 같은 변경이 이 파일에서 끝나게 한다 */
export interface ModalDialogHandle {
  open: () => void;
  close: () => void;
  isOpen: () => boolean;
}

interface ModalDialogProps {
  ref: Ref<ModalDialogHandle>;
  title: string;
  description?: string;
  /** 작업 중이면 Esc로 닫혀 결과를 놓치지 않게 막는다 */
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
  const openedAtRef = useRef(0);
  // 한 화면에 창이 여러 개 있어도 제목·설명이 서로 섞이지 않게 id를 따로 만든다
  const titleId = useId();
  const descriptionId = useId();
  useCloseDialogOnHide(dialogRef);
  useImperativeHandle(
    ref,
    () => ({
      open: () => {
        openedAtRef.current = performance.now();
        dialogRef.current?.showModal();
      },
      close: () => dialogRef.current?.close(),
      isOpen: () => dialogRef.current?.open ?? false,
    }),
    [],
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        if (isBusy) event.preventDefault();
      }}
      onClose={onClose}
      onClickCapture={(event) => {
        // 키보드 누름(detail 0)은 두 번 누르기와 상관없다
        if (shouldGuardDoubleTap && event.detail > 0 && event.timeStamp - openedAtRef.current < DOUBLE_TAP_GUARD_MS) event.stopPropagation();
      }}
      onClick={(event) => {
        if (shouldCloseOnOutsideClick && isOutsideClick(event)) event.currentTarget.close();
      }}
      className="m-auto w-[calc(100%-32px)] max-w-[360px] rounded-[14px] border border-line bg-surface p-5 text-ink backdrop:bg-background/70"
    >
      <h2 id={titleId} className="font-display text-[17px]">
        {title}
      </h2>
      {description && (
        <p id={descriptionId} className="mt-2 text-[14px] leading-[1.6] text-ink-sub">
          {description}
        </p>
      )}
      {children}
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
      className="h-12 flex-1 rounded-[10px] border border-line text-[15px] text-ink hover:bg-background disabled:opacity-50"
    >
      {cancelLabel}
    </button>
    <button
      type={isSubmit ? "submit" : "button"}
      disabled={isDisabled}
      onClick={onConfirm && (() => onConfirm())}
      className="h-12 flex-1 rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
    >
      {confirmLabel}
    </button>
  </div>
);
