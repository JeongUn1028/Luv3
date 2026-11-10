"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from "react";
import { AlbumGrid } from "@/components/dates/AlbumGrid";
import { FILLED_TAG_CHIP_CLASS_NAME, OUTLINED_TAG_CHIP_CLASS_NAME } from "@/components/dates/tagChip";
import { toTagSuggestions, type AlbumTile } from "@/lib/dates/album";
import { filterAlbumTiles, recordTagLinkCount, replaceRecordsAddress, toRecordSearchHref } from "@/lib/dates/search";

interface RecordSearchProps {
  tiles: AlbumTile[];
  /** 고른 태그. 전체면 undefined */
  tag: string | undefined;
}

const toResultLabel = (count: number): string => (count > 0 ? `기록 ${count}개` : "찾는 기록이 없어요");

/**
 * 검색 칸 + 태그 줄 + 찾은 기록. 태그만 보려는 경우가 많아 칸에 초점을 주지 않아, 키보드가 결과를 가리지 않게 한다.
 * 받침을 쓰는 중에도 글자가 끊기지 않게 검색어는 주소가 아닌 이 화면의 상태로 둔다. 찾기를 닫으면 함께 사라진다.
 *
 * @example <RecordSearch tiles={tiles} tag="카페" />
 */
export const RecordSearch = ({ tiles, tag }: RecordSearchProps): ReactElement => {
  const [query, setQuery] = useState("");
  const [shownTag, setShownTag] = useState(tag);
  const [pressedTag, setPressedTag] = useState(tag);
  // 상세의 태그를 누른 횟수. 같은 태그를 누르면 주소가 그대로라 태그만 보고는 알 수 없다(#261)
  const tagLinkCount = useSyncExternalStore(recordTagLinkCount.subscribe, recordTagLinkCount.get, () => 0);
  const [seenTagLinkCount, setSeenTagLinkCount] = useState(tagLinkCount);

  // 태그 줄을 누르지 않았는데 태그가 바뀌었거나 상세의 태그를 눌렀으면 새 목록을 보러 온 것이다. 쓰던 검색어로 거르면 일부만 보이므로 지운다
  const isTagLinkPressed = tagLinkCount !== seenTagLinkCount;
  if (tag !== shownTag || isTagLinkPressed) {
    setShownTag(tag);
    setSeenTagLinkCount(tagLinkCount);
    if (tag !== pressedTag || isTagLinkPressed) setQuery("");
  }

  const tags = toTagSuggestions(tiles.map((tile) => tile.tags));
  const found = filterAlbumTiles(tiles, { query, tag });
  // 기록이 하나도 없으면 그리드의 빈 화면이 이미 알려 준다
  const isFiltering = tiles.length > 0 && (query.trim() !== "" || tag !== undefined);
  const tagRowRef = useRef<HTMLUListElement>(null);

  // 상세의 태그로 들어오면 고른 태그가 줄 끝에 숨어 있을 수 있다. 스크롤 위치가 되살아나는 때에도 돌므로 세로로는 움직이지 않는다
  useEffect(() => {
    const row = tagRowRef.current;
    const selected = row?.querySelector('[aria-pressed="true"]');
    if (!row || !selected) return;
    const rowBox = row.getBoundingClientRect();
    const selectedBox = selected.getBoundingClientRect();
    const rowPadding = 16;
    if (selectedBox.right > rowBox.right) row.scrollLeft += selectedBox.right - rowBox.right + rowPadding;
    else if (selectedBox.left < rowBox.left) row.scrollLeft -= rowBox.left - selectedBox.left + rowPadding;
  }, [tag]);

  const selectTag = (nextTag?: string) => {
    setPressedTag(nextTag);
    replaceRecordsAddress(toRecordSearchHref(nextTag));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    // 글자마다 찾으므로 검색 키는 키보드를 닫아 결과를 보여 주는 일만 한다. 받침을 쓰는 중에 누른 키는 글자를 끝내는 키다
    if (event.key === "Enter" && !event.nativeEvent.isComposing) event.currentTarget.blur();
  };

  return (
    <>
      <input
        type="search"
        value={query}
        aria-label="기록 찾기"
        placeholder="제목, 장소, 글, 한마디"
        enterKeyHint="search"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        className="mt-1 h-[51px] w-full shrink-0 appearance-none rounded-[10px] border border-line bg-surface px-4 text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none"
      />
      {tags.length > 0 && (
        // 옆으로 밀리는 줄은 위아래가 잘리므로, 넓힌 누름 영역만큼 안쪽을 비운다
        <ul ref={tagRowRef} aria-label="태그로 모아 보기" className="-mx-4 mt-1 flex shrink-0 gap-1.5 overflow-x-auto px-4 py-[9px] [scrollbar-width:none]">
          <li className="shrink-0">
            <button
              type="button"
              aria-pressed={tag === undefined}
              onClick={() => selectTag()}
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
                  onClick={() => selectTag(isSelected ? undefined : name)}
                  className={isSelected ? FILLED_TAG_CHIP_CLASS_NAME : OUTLINED_TAG_CHIP_CLASS_NAME}
                >
                  {name}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {/* 알림 영역은 처음부터 있어야 첫 결과도 읽힌다. 비어 있을 때는 자리만 차지하지 않는다 */}
      <p role="status" className="mt-1 text-[12px] text-ink-sub empty:mt-0">
        {isFiltering ? toResultLabel(found.length) : ""}
      </p>
      {(found.length > 0 || tiles.length === 0) && <AlbumGrid tiles={found} />}
    </>
  );
};
