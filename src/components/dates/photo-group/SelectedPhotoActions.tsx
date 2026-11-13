import type { ReactElement } from "react";
import { runKeepingFocus } from "@/lib/keep-focus";

// 보이는 크기는 36px로 두고 누르는 영역만 44px로 넓힌다. 버튼 사이 간격(8px)을 반씩 나눠 가져 서로 겹치지 않는다(#105).
// 가상 요소는 테두리 안쪽을 기준으로 놓이므로 테두리 1px을 더해 5px 넓힌다
const smallButtonClassName =
  "press-icon relative h-9 min-w-9 rounded-[8px] border border-line px-2 text-[12px] text-ink-sub after:absolute after:-inset-[5px] hover:text-ink disabled:opacity-30 aria-disabled:opacity-30";

interface SelectedPhotoActionsProps {
  /** 화면 읽기 프로그램에 읽어 줄 모음 이름(모음 1) */
  groupName: string;
  photoId: string;
  /** 모음 안 순서(0부터) */
  photoIndex: number;
  photoCount: number;
  isCover: boolean;
  isDisabled: boolean;
  onCoverChange: (photoId: string) => void;
  onMovePhoto: (photoId: string, offset: -1 | 1) => void;
  onRemovePhoto: (photoId: string) => void;
  /** 모음이 빠져 이웃 모음도 없을 때 초점을 받을 곳(새 모음 만들기) */
  focusFallback: () => HTMLElement | null;
}

/**
 * 모음 카드에서 누른 사진의 순서·대표·빼기(#298). 한마디는 모음마다 하나라 여기서 묻지 않는다(#309).
 *
 * @example {selected && <SelectedPhotoActions groupName="모음 1" photoId={selected.id} photoIndex={1} photoCount={3} isCover={false} isDisabled={false} onCoverChange={setCover} onMovePhoto={move} onRemovePhoto={remove} focusFallback={() => pickRef.current} />}
 */
export const SelectedPhotoActions = ({
  groupName,
  photoId,
  photoIndex,
  photoCount,
  isCover,
  isDisabled,
  onCoverChange,
  onMovePhoto,
  onRemovePhoto,
  focusFallback,
}: SelectedPhotoActionsProps): ReactElement => (
  <div role="group" aria-label={`${groupName}의 ${photoIndex + 1}번째 사진`} className="border-t border-line pt-2.5">
    <div className="flex flex-wrap items-center gap-2">
      <span aria-hidden="true" className="text-[12px] text-ink-sub">
        {photoIndex + 1}번째 사진
      </span>
      <button
        type="button"
        aria-pressed={isCover}
        disabled={isDisabled}
        onClick={() => onCoverChange(photoId)}
        className={`${smallButtonClassName} aria-pressed:border-accent aria-pressed:text-accent`}
      >
        대표로
      </button>
      {/* 끝에 있는 순서 버튼은 초점을 잃지 않도록 disabled 대신 aria-disabled로 둔다. 끝을 넘는 이동은 moveItem이 무시한다 */}
      <button
        type="button"
        disabled={isDisabled}
        aria-disabled={photoIndex === 0}
        onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => onMovePhoto(photoId, -1) })}
        className={smallButtonClassName}
      >
        앞으로
      </button>
      <button
        type="button"
        disabled={isDisabled}
        aria-disabled={photoIndex === photoCount - 1}
        onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => onMovePhoto(photoId, 1) })}
        className={smallButtonClassName}
      >
        뒤로
      </button>
      <button
        type="button"
        disabled={isDisabled}
        // 빼면 같은 자리의 다음 사진이 골라져 이 버튼이 그대로 남는다. 모음의 마지막 사진이면 모음이 빠져 새 모음 만들기로 간다
        onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => onRemovePhoto(photoId), fallback: focusFallback() })}
        className={`${smallButtonClassName} ml-auto`}
      >
        이 사진 빼기
      </button>
    </div>
  </div>
);
