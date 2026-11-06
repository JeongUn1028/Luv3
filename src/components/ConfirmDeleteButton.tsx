"use client";

import { useRef, useState, type ReactElement } from "react";
import { ModalActions, ModalDialog, ModalMessage, type ModalDialogHandle } from "@/components/ModalDialog";

interface ConfirmDeleteButtonProps {
  /** 확인 창 제목. 예: "이 기록을 지울까요?" */
  title: string;
  description: string;
  /** 지우기. 실패하면 던진다(성공하면 보통 다른 화면으로 이동한다) */
  onConfirm: () => Promise<void>;
  /** 실패했을 때 확인 창에 보여 줄 문구 */
  failureMessage: string;
  className?: string;
}

/** "삭제" 버튼과 확인 창 */
export const ConfirmDeleteButton = ({
  title,
  description,
  onConfirm,
  failureMessage,
  className = "press-icon h-11 px-3 text-[14px] text-ink-sub hover:text-ink",
}: ConfirmDeleteButtonProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string>();

  const handleOpen = () => {
    setMessage(undefined);
    modalRef.current?.open();
  };

  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setMessage(undefined);
    try {
      await onConfirm();
    } catch (error) {
      // 사용자에게는 다시 시도할 수 있다는 문구만 보여 주고, 원인은 개발자 도구에서 볼 수 있게 남긴다
      console.error(error);
      setMessage(failureMessage);
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button type="button" onClick={handleOpen} className={className}>
        삭제
      </button>
      <ModalDialog ref={modalRef} title={title} description={description} isBusy={isDeleting}>
        {message && <ModalMessage>{message}</ModalMessage>}
        <ModalActions
          cancelLabel="취소"
          onCancel={() => modalRef.current?.close()}
          confirmLabel={isDeleting ? "지우는 중…" : "삭제"}
          onConfirm={handleConfirm}
          isDisabled={isDeleting}
        />
      </ModalDialog>
    </>
  );
};
