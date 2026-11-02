"use client";

import { useRouter } from "next/navigation";
import { startTransition, useRef, useState, type ReactElement } from "react";
import { DeleteDateRecordError, deleteDateRecord } from "@/lib/dates/delete";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { createClient } from "@/lib/supabase/client";

interface DeleteRecordButtonProps {
  recordId: string;
  /** 함께 지울 사진 파일(원본·썸네일) */
  filePaths: string[];
  photoCount: number;
}

/** 기록 삭제 버튼과 확인 창. 확인하면 사진 파일과 기록을 지우고 홈으로 간다 */
export const DeleteRecordButton = ({ recordId, filePaths, photoCount }: DeleteRecordButtonProps): ReactElement => {
  const router = useRouter();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string>();

  const handleOpen = () => {
    setMessage(undefined);
    // showModal은 바깥 초점을 막고 Esc로 닫히는 모달을 브라우저가 만들어 준다
    dialogRef.current?.showModal();
  };

  const handleDelete = async () => {
    if (isDeleting) return;
    setIsDeleting(true);
    setMessage(undefined);
    try {
      const supabase = createClient();
      await deleteDateRecord({
        recordId,
        filePaths,
        storage: supabase.storage.from(ALBUM_BUCKET),
        deleteRecord: (id) => supabase.from("dates").delete().eq("id", id),
      });
      startTransition(() => {
        router.replace("/");
        router.refresh();
      });
    } catch (error) {
      setMessage(
        error instanceof DeleteDateRecordError ? error.message : "기록을 지우지 못했어요. 잠시 후 다시 시도해 주세요.",
      );
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button type="button" onClick={handleOpen} className="h-11 px-3 text-[14px] text-ink-sub hover:text-ink">
        삭제
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby="delete-record-title"
        aria-describedby="delete-record-description"
        // 지우는 중에 Esc로 닫혀 결과를 놓치지 않게 한다
        onCancel={(event) => {
          if (isDeleting) event.preventDefault();
        }}
        className="m-auto w-[calc(100%-32px)] max-w-[360px] rounded-[14px] border border-line bg-surface p-5 text-ink backdrop:bg-background/70"
      >
        <h2 id="delete-record-title" className="text-[17px] font-bold">
          이 기록을 지울까요?
        </h2>
        <p id="delete-record-description" className="mt-2 text-[14px] leading-[1.6] text-ink-sub">
          사진 {photoCount}장과 글이 모두 지워지고 되돌릴 수 없어요.
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
            onClick={handleDelete}
            className="h-12 flex-1 rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
          >
            {isDeleting ? "지우는 중…" : "삭제"}
          </button>
        </div>
      </dialog>
    </>
  );
};
