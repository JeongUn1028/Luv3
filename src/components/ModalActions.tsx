"use client";

import type { ReactElement, ReactNode } from "react";

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
  /** 작업 중. 누른 버튼이 초점을 잃지 않게 disabled 대신 aria-disabled로 두고 누름을 막는다 */
  isDisabled?: boolean;
  /** 창이 열린 뒤 이 줄이 새로 나타날 때 초점을 취소 버튼으로 옮긴다 */
  shouldFocusCancel?: boolean;
}

/** 확인 버튼은 함수를 부르거나 폼을 제출한다. 둘 다 빠뜨려 눌러도 아무 일이 없는 버튼을 만들지 못하게 한다 */
type ModalActionsProps = ModalActionsBaseProps & ({ onConfirm: () => void; isSubmit?: false } | { onConfirm?: undefined; isSubmit: true });

/**
 * 창 아래쪽의 취소·확인 버튼 한 줄.
 *
 * @example <ModalActions cancelLabel="취소" onCancel={handleClose} confirmLabel="지우기" onConfirm={handleConfirm} />
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
      aria-disabled={isDisabled}
      onClick={isDisabled ? undefined : onCancel}
      className="press-wide h-12 flex-1 rounded-[10px] border border-line text-[15px] text-ink hover:bg-background aria-disabled:opacity-50 aria-disabled:hover:bg-transparent"
    >
      {cancelLabel}
    </button>
    <button
      type={isSubmit ? "submit" : "button"}
      aria-disabled={isDisabled}
      onClick={(event) => {
        // 제출 버튼은 폼 제출까지 막는다
        if (isDisabled) {
          event.preventDefault();
          return;
        }
        onConfirm?.();
      }}
      className="press-wide h-12 flex-1 rounded-[10px] bg-accent font-display text-[15px] text-background aria-disabled:opacity-50"
    >
      {confirmLabel}
    </button>
  </div>
);
