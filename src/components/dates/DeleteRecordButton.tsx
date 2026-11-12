"use client";

import { useRouter } from "next/navigation";
import { startTransition, type ReactElement } from "react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { RECORDS_PATH } from "@/lib/dates/album";
import { deleteDateRecord } from "@/lib/dates/delete";
import { TRASH_RETENTION_DAYS } from "@/lib/photos/trash";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { createClient } from "@/lib/supabase/client";

interface DeleteRecordButtonProps {
  recordId: string;
  photoCount: number;
}

/** 기록 삭제 버튼과 확인 창. 확인하면 기록을 지우고(사진은 휴지통에 남는다) 기록 탭으로 간다 */
export const DeleteRecordButton = ({ recordId, photoCount }: DeleteRecordButtonProps): ReactElement => {
  const router = useRouter();

  const handleConfirm = async () => {
    const supabase = createClient();
    await deleteDateRecord({ recordId, deleteRecord: (id) => supabase.from("dates").delete().eq("id", id) });
  };

  const goToList = () => {
    startTransition(() => {
      router.replace(RECORDS_PATH, { transitionTypes: BACK_TRANSITION });
      router.refresh();
    });
  };

  return (
    <ConfirmDeleteButton
      title="이 기록을 지울까요?"
      description={`글과 두 사람이 남긴 댓글은 지워지고 되돌릴 수 없어요. 사진 ${photoCount}장은 설정 > 휴지통에 ${TRASH_RETENTION_DAYS}일 동안 남아요.`}
      subject="기록을"
      noticeKey={`delete:record:${recordId}`}
      onConfirm={handleConfirm}
      onDeleted={goToList}
      failureMessage="기록을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
    />
  );
};
