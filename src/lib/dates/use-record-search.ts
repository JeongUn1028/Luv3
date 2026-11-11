import { useEffect, useRef, useState } from "react";
import type { AlbumTile } from "./album";
import { appendNewItems } from "./album-pages";
import { fetchRecordPage, reportSessionLost } from "./fetch-record-page";
import { toSearchWords, type RecordCursor } from "./search-api";

interface LoadedResults {
  /** 이 결과를 받은 조건 */
  key: string;
  items: AlbumTile[];
  total: number;
  next: RecordCursor | undefined;
  isLoadingMore: boolean;
  isMoreFailed: boolean;
}

/** 찾기 결과의 상태 */
export type RecordSearchStatus = "idle" | "loading" | "failed" | "done";

interface UseRecordSearchParams {
  /** 띄어 쓴 그대로의 검색어. 바뀔 때마다 찾지 않고 다 쓴 것을 넘긴다 */
  query: string;
  tag: string | undefined;
  /** 바뀌면 같은 조건이라도 다시 찾는다. 모든 기록의 판 번호를 넘겨, 누가 기록을 쓰거나 고치거나 지웠을 때 다시 찾게 한다 */
  refreshKey: string;
}

interface UseRecordSearchResult {
  status: RecordSearchStatus;
  /** 지금 조건의 결과. 다시 찾는 동안에는 앞 조건의 결과를 그대로 둔다 */
  items: AlbumTile[];
  /** 맞는 기록 전체의 수. 아직 받지 못했으면 undefined */
  total: number | undefined;
  hasMore: boolean;
  isLoadingMore: boolean;
  isMoreFailed: boolean;
  loadMore: () => void;
  retry: () => void;
}

/**
 * 검색어·태그로 서버에서 기록을 찾고, 다음 묶음을 이어 받는다(#273). 검색어와 태그가 모두 비면 찾지 않는다.
 * 다른 화면에 갔다 돌아오면(Activity) 효과가 다시 돌지만, 같은 조건으로 이미 받은 결과는 다시 받지 않아 이어 받은 기록과 스크롤 위치를 지킨다.
 *
 * @example const search = useRecordSearch({ query, tag, refreshKey })
 */
export const useRecordSearch = ({ query, tag, refreshKey }: UseRecordSearchParams): UseRecordSearchResult => {
  const words = toSearchWords(query).join(" ");
  const isActive = words !== "" || tag !== undefined;
  const key = JSON.stringify([words, tag, refreshKey]);
  const [results, setResults] = useState<LoadedResults | undefined>(undefined);
  const [failedKey, setFailedKey] = useState<string | undefined>(undefined);
  const [retryCount, setRetryCount] = useState(0);
  const loadedKey = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!isActive || loadedKey.current === key) return;
    const controller = new AbortController();
    fetchRecordPage({ query: words, tag, after: undefined }, controller.signal).then(
      (page) => {
        // 본문까지 받은 뒤 조건이 바뀌었으면 끊어도 여기로 온다. 예전 조건의 결과로 지금 조건을 받은 것처럼 남기지 않는다
        if (controller.signal.aborted) return;
        loadedKey.current = key;
        setFailedKey(undefined);
        setResults({ key, ...page, isLoadingMore: false, isMoreFailed: false });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setFailedKey(key);
        reportSessionLost(error);
      },
    );
    return () => controller.abort();
  }, [isActive, key, words, tag, retryCount]);

  const isCurrent = results?.key === key;
  const status: RecordSearchStatus = !isActive ? "idle" : isCurrent ? "done" : failedKey === key ? "failed" : "loading";

  const loadMore = () => {
    if (!results || !isCurrent || !results.next || results.isLoadingMore) return;
    const after = results.next;
    const update = (change: (current: LoadedResults) => LoadedResults) =>
      setResults((current) => (current?.key === key ? change(current) : current));

    update((current) => ({ ...current, isLoadingMore: true, isMoreFailed: false }));
    fetchRecordPage({ query: words, tag, after }).then(
      (page) => update((current) => ({ ...current, items: appendNewItems(current.items, page.items), next: page.next, isLoadingMore: false })),
      (error: unknown) => {
        update((current) => ({ ...current, isLoadingMore: false, isMoreFailed: true }));
        reportSessionLost(error);
      },
    );
  };

  const retry = () => {
    setFailedKey(undefined);
    setRetryCount((count) => count + 1);
  };

  return {
    status,
    items: results?.items ?? [],
    total: isCurrent ? results.total : undefined,
    hasMore: isCurrent && results.next !== undefined,
    isLoadingMore: isCurrent && results.isLoadingMore,
    isMoreFailed: isCurrent && results.isMoreFailed,
    loadMore,
    retry,
  };
};
