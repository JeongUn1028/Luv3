import Link from "next/link";
import type { ReactElement } from "react";
import { ReloadLatestButton } from "@/components/ReloadLatestButton";
import { toRecordFormEnding } from "@/lib/dates/record-form-outcome";
import type { SaveProgress } from "@/lib/dates/save";
import { toSaveProgressLabel } from "@/lib/dates/save-progress";
import { FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { RecordSaveButton } from "../RecordSaveButton";

interface RecordFormFooterProps {
  /** 폼 아래 안내(칸 오류, 뺀 사진, 저장 실패) */
  notice: string | undefined;
  isRecordGone: boolean;
  linkedRecordId: string | undefined;
  hasConflict: boolean | undefined;
  isSaving: boolean;
  isReadingPhotoInfo: boolean;
  progress: SaveProgress | undefined;
  /** 지워진 기록의 폼에서 기록 목록으로 나간다 */
  onGoToRecords: () => void;
}

/**
 * 기록 폼 맨 아래(#315): 안내 문구와, 저장 버튼 또는 다시 저장해도 실패할 때 나갈 길(기록 목록·이미 남긴 기록·최신 내용 불러오기).
 * 저장 진행은 화면 읽기 프로그램에도 읽어 준다.
 *
 * @example <RecordFormFooter notice={notice} isRecordGone={false} linkedRecordId={undefined} hasConflict={draft.hasConflict} isSaving={false} isReadingPhotoInfo={false} progress={undefined} onGoToRecords={goToRecords} />
 */
export const RecordFormFooter = ({
  notice,
  isRecordGone,
  linkedRecordId,
  hasConflict,
  isSaving,
  isReadingPhotoInfo,
  progress,
  onGoToRecords,
}: RecordFormFooterProps): ReactElement => {
  const ending = toRecordFormEnding({ isRecordGone, linkedRecordId, hasConflict });

  return (
    <div className="flex flex-col">
      {notice && (
        <p role="alert" className="mb-3 text-[13px] text-accent">
          {notice}
        </p>
      )}
      {ending.kind === "go-to-records" && (
        // 다시 저장해도 실패하고 사진만 또 올리게 되므로 저장 버튼 대신 나가는 길을 준다
        <button type="button" onClick={onGoToRecords} className="press-wide h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background">
          기록 목록으로
        </button>
      )}
      {ending.kind === "open-linked-record" && (
        // 다시 저장해도 거부되므로 저장 버튼 대신 남긴 기록으로 가는 길을 준다
        <Link
          href={`/dates/${ending.recordId}`}
          transitionTypes={FORWARD_TRANSITION}
          className="press-wide flex h-[52px] w-full items-center justify-center rounded-[10px] bg-accent font-display text-[15px] text-background"
        >
          남긴 기록 보기
        </Link>
      )}
      {ending.kind === "reload-latest" && <ReloadLatestButton />}
      {ending.kind === "save" && <RecordSaveButton isSaving={isSaving} isReadingPhotoInfo={isReadingPhotoInfo} progress={progress} />}
      <p aria-live="polite" className="sr-only">
        {progress ? toSaveProgressLabel(progress) : ""}
      </p>
    </div>
  );
};
