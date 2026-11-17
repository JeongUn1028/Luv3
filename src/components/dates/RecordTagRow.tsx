"use client";

import { useEffect, useRef, type ReactElement } from "react";
import { FILLED_TAG_CHIP_CLASS_NAME, OUTLINED_TAG_CHIP_CLASS_NAME } from "@/components/dates/tagChip";

interface RecordTagRowProps {
  /** 줄에 그릴 태그. 고른 태그가 목록에 없어도 들어 있어야 풀 수 있다 */
  tags: string[];
  /** 고른 태그. 전체면 undefined */
  tag: string | undefined;
  /** 고른 태그를 다시 누르거나 "전체"를 누르면 undefined */
  onSelect: (tag?: string) => void;
}

/**
 * 기록 찾기의 "전체" + 태그 버튼 줄. 옆으로 밀어 보고, 고른 태그가 줄 밖에 있으면 보이게 옮긴다.
 *
 * @example <RecordTagRow tags={["카페", "바다"]} tag="카페" onSelect={selectTag} />
 */
export const RecordTagRow = ({ tags, tag, onSelect }: RecordTagRowProps): ReactElement => {
  const rowRef = useRef<HTMLUListElement>(null);

  // 상세의 태그로 들어오면 고른 태그가 줄 끝에 숨어 있을 수 있다. 스크롤 위치가 되살아나는 때에도 돌므로 세로로는 움직이지 않는다
  useEffect(() => {
    const row = rowRef.current;
    const selected = row?.querySelector('[aria-pressed="true"]');
    if (!row || !selected) return;
    const rowBox = row.getBoundingClientRect();
    const selectedBox = selected.getBoundingClientRect();
    const rowPadding = 16;
    if (selectedBox.right > rowBox.right) row.scrollLeft += selectedBox.right - rowBox.right + rowPadding;
    else if (selectedBox.left < rowBox.left) row.scrollLeft -= rowBox.left - selectedBox.left + rowPadding;
  }, [tag]);

  return (
    // 옆으로 밀리는 줄은 위아래가 잘리므로, 넓힌 누름 영역만큼 안쪽을 비운다
    <ul ref={rowRef} aria-label="태그로 모아 보기" className="-mx-4 mt-1 flex shrink-0 gap-1.5 overflow-x-auto px-4 py-[9px] [scrollbar-width:none]">
      <li className="shrink-0">
        <button
          type="button"
          aria-pressed={tag === undefined}
          onClick={() => onSelect()}
          className={tag === undefined ? FILLED_TAG_CHIP_CLASS_NAME : OUTLINED_TAG_CHIP_CLASS_NAME}
        >
          전체
        </button>
      </li>
      {tags.map((name) => {
        const isSelected = name.toLowerCase() === tag?.toLowerCase();
        return (
          <li key={name} className="shrink-0">
            <button
              type="button"
              aria-pressed={isSelected}
              onClick={() => onSelect(isSelected ? undefined : name)}
              className={isSelected ? FILLED_TAG_CHIP_CLASS_NAME : OUTLINED_TAG_CHIP_CLASS_NAME}
            >
              {name}
            </button>
          </li>
        );
      })}
    </ul>
  );
};
