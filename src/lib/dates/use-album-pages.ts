import { useState } from "react";
import type { AlbumTile } from "./album";
import { appendAlbumPage, createAlbumPages, syncAlbumFirstPage, toAlbumItems, type AlbumFirstPage, type AlbumPages } from "./album-pages";
import { fetchRecordPage, reportSessionLost } from "./fetch-record-page";

/** 기록 탭 그리드가 받은 기록과 이어 받기 */
export interface UseAlbumPagesResult {
  /** 지금까지 받은 기록(최신순) */
  items: AlbumTile[];
  hasMore: boolean;
  isLoadingMore: boolean;
  isMoreFailed: boolean;
  loadMore: () => void;
}

/**
 * 기록 탭 그리드의 기록을 60개씩 이어 받는다(#274). 서버가 그린 첫 묶음에서 시작한다.
 * 화면을 새로 받아도(앱 복귀·뒤로 가기) 기록이 그대로면 이어 받은 기록을 지켜, 스크롤 위치가 되살아난다.
 * 다른 화면에 가 있는 동안(Activity) 상태가 남으므로 상세에 다녀와도 처음부터 다시 받지 않는다.
 *
 * @example const grid = useAlbumPages(firstPage)
 */
export const useAlbumPages = (firstPage: AlbumFirstPage): UseAlbumPagesResult => {
  const [pages, setPages] = useState(() => createAlbumPages(firstPage));
  if (pages.firstPage !== firstPage) setPages(syncAlbumFirstPage(pages, firstPage));

  const loadMore = () => {
    if (!pages.next || pages.isLoadingMore) return;
    const { generation, next: after } = pages;
    // 처음부터 다시 시작했으면 그 전에 보낸 요청의 응답은 지금 목록에 붙이지 않는다
    const update = (change: (current: AlbumPages) => AlbumPages) =>
      setPages((current) => (current.generation === generation ? change(current) : current));

    update((current) => ({ ...current, isLoadingMore: true, isMoreFailed: false }));
    fetchRecordPage({ query: "", tag: undefined, after }).then(
      (page) => update((current) => appendAlbumPage(current, page)),
      (error: unknown) => {
        update((current) => ({ ...current, isLoadingMore: false, isMoreFailed: true }));
        reportSessionLost(error);
      },
    );
  };

  return {
    items: toAlbumItems(pages),
    hasMore: pages.next !== undefined,
    isLoadingMore: pages.isLoadingMore,
    isMoreFailed: pages.isMoreFailed,
    loadMore,
  };
};
