"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type KeyboardEvent, type ReactElement } from "react";
import { AlbumGrid } from "@/components/dates/AlbumGrid";
import { FILLED_TAG_CHIP_CLASS_NAME, OUTLINED_TAG_CHIP_CLASS_NAME } from "@/components/dates/tagChip";
import { FIELD_BOX_CLASS_NAME } from "@/components/FormField";
import { LoadMoreTrigger } from "@/components/LoadMoreTrigger";
import { RetryButton } from "@/components/RetryButton";
import { SEARCH_TEXT_MAX_LENGTH } from "@/lib/dates/search-api";
import { recordTagLinkCount, replaceRecordsAddress, toRecordSearchHref } from "@/lib/dates/search";
import type { UseAlbumPagesResult } from "@/lib/dates/use-album-pages";
import { useRecordSearch, type RecordSearchStatus } from "@/lib/dates/use-record-search";

interface RecordSearchProps {
  /** 기록 탭 그리드. 검색어와 태그가 모두 비면 이것을 그대로 보여 주고 이어 받는다 */
  grid: UseAlbumPagesResult;
  /** 모든 기록의 판 번호. 바뀌면(누가 기록을 쓰거나 고치거나 지움) 같은 조건이라도 다시 찾는다 */
  refreshKey: string;
  /** 태그 줄. 많이 쓴 순서로 서버가 센 것이다 */
  tags: string[];
  /** 고른 태그. 전체면 undefined */
  tag: string | undefined;
}

/** 글자를 칠 때마다 서버를 부르지 않고, 이만큼 멈추면 찾는다 */
const SEARCH_DELAY_MS = 300;

const toResultLabel = (status: RecordSearchStatus, total: number | undefined): string => {
  if (status === "loading") return "찾는 중…";
  if (status !== "done" || total === undefined) return "";
  return total > 0 ? `기록 ${total}개` : "찾는 기록이 없어요";
};

/**
 * 검색 칸 + 태그 줄 + 찾은 기록. 태그만 보려는 경우가 많아 칸에 초점을 주지 않아, 키보드가 결과를 가리지 않게 한다.
 * 받침을 쓰는 중에도 글자가 끊기지 않게 검색어는 주소가 아닌 이 화면의 상태로 둔다. 찾기를 닫으면 함께 사라진다.
 * 찾기는 서버가 한다(#273). 검색어와 태그가 모두 비면 받아 둔 그리드(`grid`)를 그대로 보여 주고 이어 받는다.
 * 앱 복귀·뒤로 가기로 화면을 새로 받아도 기록이 그대로면(판 번호가 같으면) 이어 받은 결과와 스크롤 위치를 지킨다.
 *
 * @example <RecordSearch grid={grid} refreshKey={firstPage.version} tags={tags} tag="카페" />
 */
export const RecordSearch = ({ grid, refreshKey, tags, tag }: RecordSearchProps): ReactElement => {
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
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
    if (tag !== pressedTag || isTagLinkPressed) {
      setQuery("");
      setSearchedQuery("");
    }
  }

  useEffect(() => {
    if (query === searchedQuery) return;
    const timer = setTimeout(() => setSearchedQuery(query), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [query, searchedQuery]);

  // 지운 것은 기다리지 않는다. 기다리면 지운 뒤에도 앞 검색어로 찾은 결과가 잠깐 남는다
  const search = useRecordSearch({ query: query.trim() === "" ? "" : searchedQuery, tag, refreshKey });
  // 기록이 하나도 없으면 그리드의 빈 화면이 이미 알려 준다
  const isFiltering = grid.items.length > 0 && search.status !== "idle";
  const isIdle = search.status === "idle";
  const shownTiles = isIdle ? grid.items : search.items;
  // 태그 줄을 못 읽었거나 아직 세지 않은 태그로 들어와도 고른 태그와 "전체"는 보여 줘야 풀 수 있다
  const shownTags = tag === undefined || tags.some((name) => name.toLowerCase() === tag.toLowerCase()) ? tags : [tag, ...tags];
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
    // 멈추면 찾으므로 검색 키는 기다리지 않고 바로 찾고 키보드를 닫는다. 받침을 쓰는 중에 누른 키는 글자를 끝내는 키다
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    setSearchedQuery(query);
    event.currentTarget.blur();
  };

  return (
    <>
      <input
        type="search"
        value={query}
        aria-label="기록 찾기"
        placeholder="제목, 글, 한마디"
        enterKeyHint="search"
        maxLength={SEARCH_TEXT_MAX_LENGTH}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={handleKeyDown}
        className={`mt-1 w-full shrink-0 appearance-none px-4 ${FIELD_BOX_CLASS_NAME}`}
      />
      {shownTags.length > 0 && (
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
          {shownTags.map((name) => {
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
        {isFiltering ? toResultLabel(search.status, search.total) : ""}
      </p>
      {search.status === "failed" ? (
        <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
          <p role="alert" className="text-[13px] break-keep text-balance text-ink-sub">
            기록을 찾지 못했어요. 잠시 후 다시 시도해 주세요.
          </p>
          <div className="flex w-full max-w-60 flex-col gap-2.5">
            <RetryButton isPending={false} onRetry={search.retry} />
          </div>
        </div>
      ) : (
        <>
          {(shownTiles.length > 0 || grid.items.length === 0) && <AlbumGrid tiles={shownTiles} />}
          {isIdle && <LoadMoreTrigger hasMore={grid.hasMore} isLoading={grid.isLoadingMore} isFailed={grid.isMoreFailed} onLoad={grid.loadMore} />}
          {search.status === "done" && (
            <LoadMoreTrigger hasMore={search.hasMore} isLoading={search.isLoadingMore} isFailed={search.isMoreFailed} onLoad={search.loadMore} />
          )}
        </>
      )}
    </>
  );
};
