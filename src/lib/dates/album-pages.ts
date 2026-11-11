import { SIGNED_URL_MIN_REMAINING } from "@/lib/photos/limits";
import type { AlbumTile } from "./album";
import type { RecordCursor, RecordSearchPage } from "./search-api";

/** 기록 탭 그리드의 첫 묶음. 서버가 화면을 그릴 때 함께 보낸다 */
export interface AlbumFirstPage {
  items: AlbumTile[];
  /** 다음 묶음을 받을 자리. 더 없으면 undefined */
  next: RecordCursor | undefined;
  /** 모든 기록의 판 번호(`date_records_version`). 바뀌면 이어 받은 기록이 맞지 않을 수 있다 */
  version: string;
  /** 서버가 받은 시각(ms) */
  loadedAt: number;
}

/** 기록 탭 그리드가 지금까지 받은 기록 */
export interface AlbumPages {
  firstPage: AlbumFirstPage;
  /** 첫 묶음 뒤로 이어 받은 기록 */
  moreItems: AlbumTile[];
  /** 다음 묶음을 받을 자리. 더 없으면 undefined */
  next: RecordCursor | undefined;
  /** 이어 받은 묶음 중 가장 먼저 받은 때(서버 시각, ms). 이어 받지 않았으면 undefined */
  moreLoadedAt: number | undefined;
  /** 첫 묶음부터 다시 시작할 때마다 는다. 그 전에 보낸 요청의 응답은 버린다 */
  generation: number;
  isLoadingMore: boolean;
  isMoreFailed: boolean;
}

/**
 * 묶음을 받는 사이 날짜가 바뀌면 같은 기록이 다음 묶음에 다시 올 수 있어, 이미 받은 기록은 빼고 뒤에 붙인다.
 *
 * @example appendNewItems(items, page.items)
 */
export const appendNewItems = (items: AlbumTile[], nextItems: AlbumTile[]): AlbumTile[] => {
  const ids = new Set(items.map(({ id }) => id));
  return [...items, ...nextItems.filter(({ id }) => !ids.has(id))];
};

/**
 * 첫 묶음만 받은 상태를 만든다.
 *
 * @example const pages = createAlbumPages(firstPage)
 */
export const createAlbumPages = (firstPage: AlbumFirstPage, generation = 0): AlbumPages => ({
  firstPage,
  moreItems: [],
  next: firstPage.next,
  moreLoadedAt: undefined,
  generation,
  isLoadingMore: false,
  isMoreFailed: false,
});

/**
 * 화면을 새로 받아 온 첫 묶음으로 바꾼다. 기록이 그대로면 이어 받은 기록과 스크롤 위치를 지키고 첫 묶음의 사진 주소만 새것으로 바꾼다.
 * 기록이 바뀌었거나(판 번호가 다름) 이어 받은 사진 주소를 더 쓸 수 없으면 첫 묶음부터 다시 시작한다.
 * 이어 받은 주소는 받을 때 `SIGNED_URL_MIN_REMAINING` 이상 남은 것이라, 그 시간이 지나면 아직 받지 않은 사진이 깨질 수 있다.
 *
 * @example if (pages.firstPage !== firstPage) setPages(syncAlbumFirstPage(pages, firstPage))
 */
export const syncAlbumFirstPage = (pages: AlbumPages, firstPage: AlbumFirstPage): AlbumPages => {
  const isChanged = firstPage.version !== pages.firstPage.version;
  const isMoreExpired = pages.moreLoadedAt !== undefined && firstPage.loadedAt >= pages.moreLoadedAt + SIGNED_URL_MIN_REMAINING * 1000;
  if (isChanged || isMoreExpired) return createAlbumPages(firstPage, pages.generation + 1);
  return { ...pages, firstPage, next: pages.moreLoadedAt === undefined ? firstPage.next : pages.next };
};

/**
 * 이어 받은 묶음을 붙인다.
 *
 * @example setPages((current) => appendAlbumPage(current, page))
 */
export const appendAlbumPage = (pages: AlbumPages, page: Pick<RecordSearchPage, "items" | "next" | "loadedAt">): AlbumPages => ({
  ...pages,
  moreItems: appendNewItems(pages.moreItems, page.items),
  next: page.next,
  moreLoadedAt: pages.moreLoadedAt ?? page.loadedAt,
  isLoadingMore: false,
  isMoreFailed: false,
});

/**
 * 그리드에 그릴 기록. 첫 묶음과 이어 받은 기록을 겹치지 않게 잇는다.
 *
 * @example <AlbumGrid tiles={toAlbumItems(pages)} />
 */
export const toAlbumItems = (pages: AlbumPages): AlbumTile[] => appendNewItems(pages.firstPage.items, pages.moreItems);
