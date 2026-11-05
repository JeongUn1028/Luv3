"use client";

import { useId, useRef, useState, type ReactElement } from "react";

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

/** "삭제" 버튼과 확인 창. 네이티브 `<dialog>`라 바깥 초점을 막고 Esc로 닫힌다 */
export const ConfirmDeleteButton = ({
  title,
  description,
  onConfirm,
  failureMessage,
  className = "h-11 px-3 text-[14px] text-ink-sub hover:text-ink",
}: ConfirmDeleteButtonProps): ReactElement => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // 한 화면에 여러 개가 있어도 확인 창 제목·설명이 서로 섞이지 않게 id를 따로 만든다
  const titleId = useId();
  const descriptionId = useId();
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string>();

  const handleOpen = () => {
    setMessage(undefined);
    dialogRef.current?.showModal();
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
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        // 지우는 중에 Esc로 닫혀 결과를 놓치지 않게 한다
        onCancel={(event) => {
          if (isDeleting) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-32px)] max-w-[360px] rounded-[14px] border border-line bg-surface p-5 text-ink backdrop:bg-background/70"
      >
        <h2 id={titleId} className="font-display text-[17px]">
          {title}
        </h2>
        <p id={descriptionId} className="mt-2 text-[14px] leading-[1.6] text-ink-sub">
          {description}
        </p>
        {message && (
          <p role="alert" className="mt-3 text-[13px] text-accent">
            {message}
          </p>
        )}
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            disabled={isDeleting}
            onClick={() => dialogRef.current?.close()}
            className="h-12 flex-1 rounded-[10px] border border-line text-[15px] text-ink hover:bg-background disabled:opacity-50"
          >
            취소
          </button>
          <button
            type="button"
            disabled={isDeleting}
            onClick={handleConfirm}
            className="h-12 flex-1 rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
          >
            {isDeleting ? "지우는 중…" : "삭제"}
          </button>
        </div>
      </dialog>
    </>
  );
};
