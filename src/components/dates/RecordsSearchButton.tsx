"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, type ReactElement } from "react";
import { CloseIcon, SearchIcon } from "@/components/icons";
import { SCREEN_HEADER_ICON_CLASS_NAME } from "@/components/ScreenHeader";
import { RECORDS_PATH } from "@/lib/dates/album";
import { parseRecordFilter, replaceRecordsAddress, toRecordSearchHref } from "@/lib/dates/search";
import { scrollAreaToTop } from "@/lib/navigation/scroll-memory";

/** 검색 칸은 내용 맨 위에 있으므로 누를 때 맨 위로 올린다 */
const SearchToggle = (): ReactElement => {
  const { isOpen } = parseRecordFilter(useSearchParams());

  const handleClick = () => {
    scrollAreaToTop("records");
    replaceRecordsAddress(isOpen ? RECORDS_PATH : toRecordSearchHref());
  };

  return (
    <button
      type="button"
      aria-label={isOpen ? "찾기 닫기" : "기록 찾기"}
      aria-expanded={isOpen}
      onClick={handleClick}
      className={SCREEN_HEADER_ICON_CLASS_NAME}
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
