"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useSyncExternalStore, type ReactElement } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { SCREEN_HEADER_ICON_CLASS_NAME } from "@/components/ScreenHeader";
import { RECORDS_PATH } from "@/lib/dates/album";
import { parseRecordFilter, recordsLoadFailedCount, replaceRecordsAddress, toRecordSearchHref } from "@/lib/dates/search";
import { scrollAreaToTop } from "@/lib/navigation/scroll-memory";

/**
 * 검색 칸은 내용 맨 위에 있으므로 누를 때 맨 위로 올린다.
 * 기록을 불러오지 못한 오류 화면에서는 찾을 기록이 없어 열지 않는다. 이미 열려 있으면 닫을 수는 있게 둔다(#261)
 */
const SearchToggle = (): ReactElement => {
  const { isOpen } = parseRecordFilter(useSearchParams());
  // 서버에서 그린 화면에는 막힘이 없고, 화면 스크립트가 붙으며 실패 문구가 알려 오면 막는다(그 전에는 눌러도 동작하지 않는다)
  const isLoadFailed = useSyncExternalStore(recordsLoadFailedCount.subscribe, recordsLoadFailedCount.get, () => 0) > 0;
  const isBlocked = isLoadFailed && !isOpen;

  const handleClick = () => {
    if (isBlocked) return;
    scrollAreaToTop("records");
    replaceRecordsAddress(isOpen ? RECORDS_PATH : toRecordSearchHref());
  };

  return (
    <button
      type="button"
      aria-label={isOpen ? "찾기 닫기" : "기록 찾기"}
      aria-expanded={isOpen}
      // 눌렀을 때 초점을 잃지 않게 disabled 대신 aria-disabled로 막는다
      aria-disabled={isBlocked}
      onClick={handleClick}
      className={`${SCREEN_HEADER_ICON_CLASS_NAME} aria-disabled:opacity-30 aria-disabled:hover:text-ink-sub`}
    >
      {isOpen ? <CloseIcon className="size-[22px]" /> : <SearchIcon className="size-[22px]" />}
    </button>
  );
};

/**
 * 기록 탭 머리글의 돋보기. 주소의 찾기 상태는 요청 때만 알 수 있어(cacheComponents), 읽기 전에는 그림만 그려 다른 버튼이 밀리지 않게 한다.
 *
 * @example <RecordsSearchButton />
 */
export const RecordsSearchButton = (): ReactElement => (
  <Suspense
    fallback={
      <span className={SCREEN_HEADER_ICON_CLASS_NAME}>
        <SearchIcon className="size-[22px]" />
      </span>
    }
  >
    <SearchToggle />
  </Suspense>
);
