"use client";

import { useRouter } from "next/navigation";
import { startTransition, useRef, useState, type ReactElement } from "react";
import { ModalActions, ModalMessage } from "@/components/ModalActions";
import { ModalDialog, type ModalDialogHandle } from "@/components/ModalDialog";
import { deletingStore } from "@/lib/deleting";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableDelete } from "@/lib/navigation/use-leavable-delete";

interface ConfirmDeleteButtonProps {
  /** 확인 창 제목. 예: "이 기록을 지울까요?" */
  title: string;
  description: string;
  /** 지우기만 한다. 실패하면 던진다 */
  onConfirm: () => Promise<void>;
  /**
   * 지우기를 확인하면 응답을 기다리지 않고 돌아갈 목록·캘린더 주소(#346). 앞 화면이 `canGoBackTo`에 맞으면 뒤로 가고, 아니면 이 주소로 옮긴다.
   * 인터넷이 끊겨 화면에 남았다가 지우기가 끝나면 이 주소로 옮긴다
   */
  returnTo: string;
  /** 앞 화면의 주소가 이 조건에 맞을 때만 뒤로 간다. 예: 같은 목록 */
  canGoBackTo: (url: URL) => boolean;
  /** 돌아간 화면이 지우는 동안 숨길 항목의 key(`DELETING_KEYS`). 지우지 못하면 다시 보여 준다 */
  deletingKey: string;
  /** 화면을 떠난 뒤 끝났을 때 알림에 쓰는 이름. 받침에 맞는 조사까지 적는다. 예: "기록을" */
  subject: string;
  /** 무엇을 지우는지 구분하는 알림 key. 예: `delete:record:${recordId}` */
  noticeKey: string;
  /** 실패했을 때 확인 창에 보여 줄 문구 */
  failureMessage: string;
  /** 한 화면에 "삭제"가 여럿일 때 무엇을 지우는지 읽어 줄 이름. 예: "댓글 삭제" */
  accessibleName?: string;
  className?: string;
}

/** "삭제" 버튼과 확인 창 */
export const ConfirmDeleteButton = ({
  title,
  description,
  onConfirm,
  returnTo,
  canGoBackTo,
  deletingKey,
  subject,
  noticeKey,
  failureMessage,
  accessibleName,
  className = "press-icon h-11 px-3 text-[14px] text-ink-sub hover:text-ink",
}: ConfirmDeleteButtonProps): ReactElement => {
  const router = useRouter();
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
    // 돌아간 뒤 폼에 다시 와도(앞으로 가기) "지우는 중"이라 같은 요청을 또 보내지 않는다
    setIsDeleting(true);
    setMessage(undefined);
    // 돌아간 목록이 처음 그릴 때부터 숨기도록 돌아가기 전에 넣는다
    deletingStore.hide(deletingKey);
    const hasReturned = beginDelete({ returnTo, canGoBackTo });
    // 인터넷이 끊겨 화면에 남으면 지우기는 실패하고, 숨긴 항목을 볼 일도 없다
    if (hasReturned) modalRef.current?.close();
    else deletingStore.restore(deletingKey);
    try {
      await onConfirm();
    } catch (error) {
      // 사용자에게는 다시 시도할 수 있다는 문구만 보여 주고, 원인은 개발자 도구에서 볼 수 있게 남긴다
      console.error(error);
      deletingStore.restore(deletingKey);
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
    // 목록으로 옮기는 동안은 "지우는 중"으로 두어 지운 항목을 또 지우지 않게 한다
    startTransition(() => {
      router.replace(returnTo, { transitionTypes: BACK_TRANSITION });
      router.refresh();
    });
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
