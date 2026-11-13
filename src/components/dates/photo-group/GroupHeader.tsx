import type { ReactElement } from "react";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon } from "@/components/icons";
import { runKeepingFocus } from "@/lib/keep-focus";

// 머리글의 아이콘 버튼은 테두리가 없어 보이는 크기 그대로 44px로 둔다
const iconButtonClassName =
  "press-icon flex size-11 items-center justify-center text-ink-sub hover:text-ink disabled:opacity-30 aria-disabled:opacity-30";

interface GroupHeaderProps {
  /** 제목 id. 모음 카드가 이 제목으로 이름 붙는다 */
  id: string;
  /** 모음 이름(모음 1) */
  groupName: string;
  photoCount: number;
  isFirst: boolean;
  isLast: boolean;
  isDisabled: boolean;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  /** 모음이 빠져 이웃 모음도 없을 때 초점을 받을 곳(새 모음 만들기) */
  focusFallback: () => HTMLElement | null;
}

/**
 * 모음 카드의 머리글(#298): 모음 이름·장수와 위·아래로 옮기기, 모음 빼기.
 *
 * @example <GroupHeader id={headingId} groupName="모음 1" photoCount={3} isFirst isLast={false} isDisabled={false} onMove={move} onRemove={remove} focusFallback={() => pickRef.current} />
 */
export const GroupHeader = ({ id, groupName, photoCount, isFirst, isLast, isDisabled, onMove, onRemove, focusFallback }: GroupHeaderProps): ReactElement => (
  <div className="-my-1 -mr-2 flex items-center justify-between">
    <h3 id={id} className="font-display text-[16px]">
      {groupName} <span className="font-sans text-[12px] text-ink-sub">{photoCount}장</span>
    </h3>
    <div className="flex">
      {/* 끝에 있는 순서 버튼은 초점을 잃지 않도록 disabled 대신 aria-disabled로 둔다. 끝을 넘는 이동은 moveItem이 무시한다 */}
      <button
        type="button"
        aria-label={`${groupName} 위로 옮기기`}
        disabled={isDisabled}
        aria-disabled={isFirst}
        onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => onMove(-1) })}
        className={iconButtonClassName}
      >
        <ChevronUpIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`${groupName} 아래로 옮기기`}
        disabled={isDisabled}
        aria-disabled={isLast}
        onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => onMove(1) })}
        className={iconButtonClassName}
      >
        <ChevronDownIcon className="size-4" />
      </button>
      <button
        type="button"
        aria-label={`${groupName} 빼기`}
        data-group-remove
        disabled={isDisabled}
        onClick={(event) =>
          runKeepingFocus({
            button: event.currentTarget,
            change: onRemove,
            neighborSelector: "[data-group-remove]",
            fallback: focusFallback(),
          })
        }
        className={iconButtonClassName}
      >
        <CloseIcon className="size-4" />
      </button>
    </div>
  </div>
);
