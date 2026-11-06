import { copyScreenLoaded } from "@/lib/navigation/screen-freshness";
import { RECORDS_PATH, type AlbumTile } from "./album";

const SEARCH_PARAM = "search";
const TAG_PARAM = "tag";

/** 기록 탭 주소에 담긴 찾기 상태 */
export interface RecordFilter {
  /** 검색 칸과 태그 줄이 열려 있는지 */
  isOpen: boolean;
  /** 고른 태그. 전체면 undefined */
  tag: string | undefined;
}

/**
 * 기록 탭 주소에서 찾기 상태를 읽는다.
 *
 * @example parseRecordFilter(new URLSearchParams("search=1&tag=카페")) // { isOpen: true, tag: "카페" }
 */
export const parseRecordFilter = (params: Pick<URLSearchParams, "get" | "has">): RecordFilter => ({
  isOpen: params.has(SEARCH_PARAM),
  tag: params.get(TAG_PARAM) || undefined,
});

/**
 * 찾기를 연 기록 탭 주소. 태그를 주면 그 태그를 고른 주소다.
 *
 * @example toRecordSearchHref("카페") // "/records?search=1&tag=%EC%B9%B4%ED%8E%98"
 */
export const toRecordSearchHref = (tag?: string): string => {
  const params = new URLSearchParams({ [SEARCH_PARAM]: "1", ...(tag && { [TAG_PARAM]: tag }) });
  return `${RECORDS_PATH}?${params.toString()}`;
};

/**
 * 기록은 이미 다 받아 두었으니 서버를 다시 부르지 않고 기록 탭 주소만 바꾼다.
 * 내용은 그대로이므로, 돌아왔을 때 새로 부를지는 처음 받은 때로 판단하게 한다.
 *
 * @example replaceRecordsAddress(toRecordSearchHref("카페"))
 */
export const replaceRecordsAddress = (href: string): void => {
  copyScreenLoaded(window.location.href, href, window.location.href);
  window.history.replaceState(null, "", href);
};

const toSearchWords = (query: string): string[] =>
  query
    .toLowerCase()
    .split(/\s+/)
    .map((word) => word.replace(/^#+/, ""))
    .filter(Boolean);

/**
 * 검색어와 태그에 맞는 기록만 받은 순서대로 고른다. 띄어 쓴 낱말은 모두 담겨 있어야 한다.
 *
 * @example filterAlbumTiles(tiles, { query: "성수 카페", tag: "데이트" })
 */
export const filterAlbumTiles = (tiles: AlbumTile[], { query, tag }: { query: string; tag: string | undefined }): AlbumTile[] => {
  const words = toSearchWords(query);
  const lowerTag = tag?.toLowerCase();
  return tiles.filter(
    ({ tags, searchText }) =>
      (lowerTag === undefined || tags.some((existing) => existing.toLowerCase() === lowerTag)) &&
      words.every((word) => searchText.includes(word)),
  );
};
