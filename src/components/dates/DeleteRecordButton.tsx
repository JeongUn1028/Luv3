"use client";

import { useRouter } from "next/navigation";
import { startTransition, type ReactElement } from "react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { deleteDateRecord } from "@/lib/dates/delete";
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

  const handleConfirm = async () => {
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
  };

  return (
    <ConfirmDeleteButton
      title="이 기록을 지울까요?"
      description={`사진 ${photoCount}장과 글이 모두 지워지고 되돌릴 수 없어요.`}
      onConfirm={handleConfirm}
      failureMessage="기록을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
    />
  );
};
