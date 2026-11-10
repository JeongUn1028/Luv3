"use client";

import { useRef, useState, type ReactElement } from "react";
import { ModalActions, ModalDialog, ModalMessage, type ModalDialogHandle } from "@/components/ModalDialog";
import { useLeavableDelete } from "@/lib/navigation/use-leavable-delete";

interface ConfirmDeleteButtonProps {
  /** 확인 창 제목. 예: "이 기록을 지울까요?" */
  title: string;
  description: string;
  /** 지우기만 한다. 실패하면 던진다 */
  onConfirm: () => Promise<void>;
  /** 지운 뒤 할 일(목록으로 옮기기 등). 지우는 사이 화면을 떠났으면 부르지 않고 알림으로 알린다(#261) */
  onDeleted: () => void;
  /** 화면을 떠난 뒤 끝났을 때 알림에 쓰는 이름. 받침에 맞는 조사까지 적는다. 예: "기록을" */
  subject: string;
  /** 무엇을 지우는지 구분하는 알림 key. 예: `delete:record:${recordId}` */
  noticeKey: string;
  /** 실패했을 때 확인 창에 보여 줄 문구 */
  failureMessage: string;
  /** 한 화면에 "삭제"가 여럿일 때 무엇을 지우는지 읽어 줄 이름. 예: "댓글 삭제" */
  accessibleName?: string;
  /** 지운 뒤 확인 창을 닫는다. 지워도 화면을 떠나지 않는 목록 안의 삭제에 쓴다(닫지 않으면 "지우는 중"에 멈춰 남는다) */
  shouldCloseOnSuccess?: boolean;
  className?: string;
}

/** "삭제" 버튼과 확인 창 */
export const ConfirmDeleteButton = ({
  title,
  description,
  onConfirm,
  onDeleted,
  subject,
  noticeKey,
  failureMessage,
  accessibleName,
  shouldCloseOnSuccess = false,
  className = "press-icon h-11 px-3 text-[14px] text-ink-sub hover:text-ink",
}: ConfirmDeleteButtonProps): ReactElement => {
  const modalRef = useRef<ModalDialogHandle>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string>();
  const { beginDelete, finishDeleted, finishDeleteFailed } = useLeavableDelete({ noticeKey, subject });

  const handleOpen = () => {
    setMessage(undefined);
    modalRef.current?.open();
  };

  const handleConfirm = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setMessage(undefined);
    beginDelete();
    try {
      await onConfirm();
    } catch (error) {
      // 사용자에게는 다시 시도할 수 있다는 문구만 보여 주고, 원인은 개발자 도구에서 볼 수 있게 남긴다
      console.error(error);
      // 떠나면 창이 닫히므로(useCloseDialogOnHide), 떠났다가 돌아왔어도 창이 닫혀 있으면 알림이 알린다
      if (finishDeleteFailed(modalRef.current?.isOpen() ?? false)) setMessage(failureMessage);
      setIsDeleting(false);
      return;
    }
    if (!finishDeleted()) {
      // 숨겨 둔 화면으로 돌아왔을 때 "지우는 중"에 멈춰 다시 누를 수 없게 되지 않도록 되돌린다
      setIsDeleting(false);
      return;
    }
    onDeleted();
    if (shouldCloseOnSuccess) {
      setIsDeleting(false);
      modalRef.current?.close();
    }
  };

  return (
    <>
      <button type="button" onClick={handleOpen} aria-label={accessibleName} className={className}>
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
