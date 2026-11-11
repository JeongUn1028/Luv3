"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactElement } from "react";
import { AlbumGrid } from "@/components/dates/AlbumGrid";
import { RecordSearch } from "@/components/dates/RecordSearch";
import { LoadMoreTrigger } from "@/components/LoadMoreTrigger";
import { RECORDS_PATH } from "@/lib/dates/album";
import type { AlbumFirstPage } from "@/lib/dates/album-pages";
import { parseRecordFilter } from "@/lib/dates/search";
import { useAlbumPages } from "@/lib/dates/use-album-pages";

interface RecordsBrowserProps {
  /** 서버가 그린 그리드의 첫 묶음. 나머지는 내리면서 이어 받는다(#274) */
  firstPage: AlbumFirstPage;
  /** 찾기의 태그 줄(많이 쓴 순) */
  tags: string[];
}

/**
 * 기록 탭 내용. 평소에는 사진 그리드만, 돋보기로 열면 찾기 화면을 보여 준다. 이어 받은 그리드는 찾기를 열고 닫아도 남는다.
 * 다른 화면에 가 있는 동안 숨겨 둔 이 화면(Activity)도 그 화면의 주소를 읽는다. 그대로 따르면 찾기가 닫혀 검색어를 잃으므로, 기록 탭 주소일 때만 따른다.
 *
 * @example <RecordsBrowser firstPage={firstPage} tags={tags} />
 */
export const RecordsBrowser = ({ firstPage, tags }: RecordsBrowserProps): ReactElement => {
  const urlFilter = parseRecordFilter(useSearchParams());
  const isCurrentScreen = usePathname() === RECORDS_PATH;
  const [filter, setFilter] = useState(urlFilter);
  const grid = useAlbumPages(firstPage);

  if (isCurrentScreen && (urlFilter.isOpen !== filter.isOpen || urlFilter.tag !== filter.tag)) setFilter(urlFilter);

  if (filter.isOpen) return <RecordSearch grid={grid} refreshKey={firstPage.version} tags={tags} tag={filter.tag} />;
  return (
    <>
      <AlbumGrid tiles={grid.items} />
      <LoadMoreTrigger hasMore={grid.hasMore} isLoading={grid.isLoadingMore} isFailed={grid.isMoreFailed} onLoad={grid.loadMore} />
    </>
  );
};
