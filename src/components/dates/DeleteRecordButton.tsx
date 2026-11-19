"use client";

import type { ReactElement } from "react";
import { ConfirmDeleteButton } from "@/components/ConfirmDeleteButton";
import { RECORDS_PATH } from "@/lib/dates/album";
import { deleteDateRecord } from "@/lib/dates/delete";
import { DELETING_KEYS } from "@/lib/deleting";
import { TRASH_RETENTION_DAYS } from "@/lib/photos/trash";
import { loadClient } from "@/lib/supabase/load-client";

interface DeleteRecordButtonProps {
  recordId: string;
  photoCount: number;
}

/** 기록 삭제 버튼과 확인 창. 확인하면 기다리지 않고 기록 탭으로 돌아가 기록을 지운다(사진은 휴지통에 남는다) */
export const DeleteRecordButton = ({ recordId, photoCount }: DeleteRecordButtonProps): ReactElement => {
  const handleConfirm = async () => {
    const supabase = await loadClient();
    await deleteDateRecord({ recordId, deleteRecord: (id) => supabase.from("dates").delete().eq("id", id) });
  };

  return (
    <ConfirmDeleteButton
      title="이 기록을 지울까요?"
      description={`글과 두 사람이 남긴 댓글은 지워지고 되돌릴 수 없어요. 사진 ${photoCount}장은 설정 > 휴지통에 ${TRASH_RETENTION_DAYS}일 동안 남아요.`}
      subject="기록을"
      noticeKey={`delete:record:${recordId}`}
      onConfirm={handleConfirm}
      returnTo={RECORDS_PATH}
      // 기록 목록에서 열었을 때만 뒤로 간다. 홈·캘린더·지도에서 열었으면 지금처럼 기록 목록으로 옮긴다
      canGoBackTo={(url) => url.pathname === RECORDS_PATH}
      deletingKey={DELETING_KEYS.record(recordId)}
      failureMessage="기록을 지우지 못했어요. 잠시 후 다시 시도해 주세요."
    />
  );
};
