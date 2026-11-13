import type { ReactElement } from "react";
import { toSaveProgressLabel, toSaveProgressRatio } from "@/lib/dates/save-progress";
import type { SaveProgress } from "@/lib/dates/save";

interface RecordSaveButtonProps {
  isSaving: boolean;
  isReadingPhotoInfo: boolean;
  /** 저장 단계. 저장을 누른 뒤 첫 알림 전에는 undefined */
  progress: SaveProgress | undefined;
}

/**
 * 기록 폼의 저장 버튼. 저장하는 동안은 반투명하게 하지 않고 한 톤 어두운 분홍이 됐다가, 사진을 올린 만큼 원래 분홍이
 * 왼쪽부터 버튼 전체로 차오른다(#312, 시안 7번). 차오르는 칸은 transform으로 움직여, 사진을 줄이느라 화면 스레드가 바빠도 부드럽다.
 * 다 차도 저장이 끝날 때까지 누를 수 없다.
 *
 * @example <RecordSaveButton isSaving={isSaving} isReadingPhotoInfo={isReadingPhotoInfo} progress={progress} />
 */
export const RecordSaveButton = ({ isSaving, isReadingPhotoInfo, progress }: RecordSaveButtonProps): ReactElement => {
  if (!isSaving) {
    return (
      <button
        type="submit"
        disabled={isReadingPhotoInfo}
        className="press-wide h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
      >
        {isReadingPhotoInfo ? "사진 정보 읽는 중…" : "저장"}
      </button>
    );
  }

  const ratio = progress ? toSaveProgressRatio(progress) : 0;
  return (
    <button
      type="submit"
      disabled
      className="relative h-[52px] w-full overflow-hidden rounded-[10px] bg-accent-dim font-display text-[15px] text-background"
    >
      <span
        aria-hidden="true"
        data-testid="save-progress-fill"
        className="absolute inset-0 origin-left bg-accent motion-safe:transition-transform motion-safe:duration-[400ms] motion-safe:ease-out"
        style={{ transform: `scaleX(${ratio})` }}
      />
      <span className="relative">{progress ? toSaveProgressLabel(progress) : "저장 중…"}</span>
    </button>
  );
};
