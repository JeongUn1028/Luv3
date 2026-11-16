"use client";

import { useState, type ReactElement, type RefObject } from "react";
import { ModalActions } from "@/components/ModalActions";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";

const MENU_BUTTON_CLASS_NAME = "press-wide h-12 w-full rounded-[10px] border border-line text-[15px] hover:bg-background";

interface CouplePhotoMenuProps {
  /** 카메라 버튼이 이 창을 연다 */
  modalRef: RefObject<ModalDialogHandle | null>;
  /** "사진 바꾸기"를 누르면 부른다. 창을 바로 닫고 사진 고르기를 연다 */
  onChange: () => void;
  /** 지우기를 확인하면 부른다 */
  onClear: () => void;
}

/**
 * 커플 사진 메뉴 창: "사진 바꾸기 / 사진 지우기 / 취소", 지우기를 누르면 같은 창에서 확인을 묻는다.
 *
 * @example <CouplePhotoMenu modalRef={modalRef} onChange={handleChangeClick} onClear={handleClear} />
 */
export const CouplePhotoMenu = ({ modalRef, onChange, onClear }: CouplePhotoMenuProps): ReactElement => {
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const handleClose = () => modalRef.current?.close();

  return (
    <ModalDialog
      ref={modalRef}
      title={isConfirmingClear ? "커플 사진을 지울까요?" : "커플 사진"}
      description={isConfirmingClear ? "두 사람 모두의 홈에서 사라지고 되돌릴 수 없어요." : undefined}
      onClose={() => setIsConfirmingClear(false)}
    >
      {isConfirmingClear ? (
        // 누른 "사진 지우기" 버튼이 사라지므로 확인 단계의 첫 버튼으로 초점을 옮긴다
        <ModalActions cancelLabel="취소" onCancel={handleClose} confirmLabel="지우기" onConfirm={onClear} shouldFocusCancel />
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          <button type="button" onClick={onChange} className={`${MENU_BUTTON_CLASS_NAME} text-ink`}>
            사진 바꾸기
          </button>
          <button type="button" onClick={() => setIsConfirmingClear(true)} className={`${MENU_BUTTON_CLASS_NAME} text-ink`}>
            사진 지우기
          </button>
          <button type="button" onClick={handleClose} className={`${MENU_BUTTON_CLASS_NAME} text-ink-sub`}>
            취소
          </button>
        </div>
      )}
    </ModalDialog>
  );
};
