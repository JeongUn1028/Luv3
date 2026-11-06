"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useState, type ReactElement } from "react";
import { AlbumGrid } from "@/components/dates/AlbumGrid";
import { RecordSearch } from "@/components/dates/RecordSearch";
import { RECORDS_PATH, type AlbumTile } from "@/lib/dates/album";
import { parseRecordFilter } from "@/lib/dates/search";

interface RecordsBrowserProps {
  tiles: AlbumTile[];
}

/**
 * 기록 탭 내용. 평소에는 사진 그리드만, 돋보기로 열면 찾기 화면을 보여 준다.
 * 다른 화면에 가 있는 동안 숨겨 둔 이 화면(Activity)도 그 화면의 주소를 읽는다. 그대로 따르면 찾기가 닫혀 검색어를 잃으므로, 기록 탭 주소일 때만 따른다.
 *
 * @example <RecordsBrowser tiles={tiles} />
 */
export const RecordsBrowser = ({ tiles }: RecordsBrowserProps): ReactElement => {
  const urlFilter = parseRecordFilter(useSearchParams());
  const isCurrentScreen = usePathname() === RECORDS_PATH;
  const [filter, setFilter] = useState(urlFilter);

  if (isCurrentScreen && (urlFilter.isOpen !== filter.isOpen || urlFilter.tag !== filter.tag)) setFilter(urlFilter);

  return filter.isOpen ? <RecordSearch tiles={tiles} tag={filter.tag} /> : <AlbumGrid tiles={tiles} />;
};
