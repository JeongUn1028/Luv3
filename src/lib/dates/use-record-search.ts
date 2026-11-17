import { useEffect, useRef, useState } from "react";
import { subscribeToAppReturn } from "@/lib/navigation/app-return";
import type { AlbumTile } from "./album";
import { appendNewItems, toMsUntilPhotoUrlsStale } from "./album-pages";
import { fetchRecordPage, reportSessionLost } from "./fetch-record-page";
import { toSearchWords, type RecordCursor } from "./search-api";

interface LoadedResults {
  /** 이 결과를 받은 조건 */
  key: string;
  /**
   * 첫 묶음을 요청한 때(이 기기 시각, ms). 서버는 요청을 받은 뒤 주소를 만들므로, 이때부터 재면 응답 지연이나 기기 시계 차이가 있어도
   * 주소를 쓸 수 있는 시간을 넘겨 재지 않는다. 다시 찾으면 바뀌어, 앞서 시작한 이어 받기 응답을 가려낸다
   */
  requestedAt: number;
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
 * 단, 받은 사진 주소를 더 쓰면 안 될 만큼 오래되면 아직 받지 않은 사진이 깨지므로 같은 조건으로 첫 묶음부터 다시 찾는다(#410).
 * 화면을 띄워 둔 채로는 그때 맞춘 타이머로, 다른 화면이나 다른 앱에 다녀오면 돌아온 때 확인한다(앱이 뒤에 있으면 타이머가 멈출 수 있다).
 * 다시 찾다 실패하면 낡은 결과 대신 실패를 보여 주고 다시 시도하게 한다.
 *
 * @example const search = useRecordSearch({ query, tag, refreshKey })
 */
export const useRecordSearch = ({ query, tag, refreshKey }: UseRecordSearchParams): UseRecordSearchResult => {
  const words = toSearchWords(query).join(" ");
  const isActive = words !== "" || tag !== undefined;
  const key = JSON.stringify([words, tag, refreshKey]);
  const [results, setResults] = useState<LoadedResults | undefined>(undefined);
  const [failedKey, setFailedKey] = useState<string | undefined>(undefined);
  const [requestCount, setRequestCount] = useState(0);
  const loadedKey = useRef<string | undefined>(undefined);
  const requestedAt = results?.key === key ? results.requestedAt : undefined;

  useEffect(() => {
    if (!isActive || loadedKey.current === key) return;
    const controller = new AbortController();
    const startedAt = Date.now();
    fetchRecordPage({ query: words, tag, after: undefined }, controller.signal).then(
      (page) => {
        // 본문까지 받은 뒤 조건이 바뀌었으면 끊어도 여기로 온다. 예전 조건의 결과로 지금 조건을 받은 것처럼 남기지 않는다
        if (controller.signal.aborted) return;
        loadedKey.current = key;
        setFailedKey(undefined);
        setResults({ key, requestedAt: startedAt, ...page, isLoadingMore: false, isMoreFailed: false });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setFailedKey(key);
        reportSessionLost(error);
      },
    );
    return () => controller.abort();
  }, [isActive, key, words, tag, requestCount]);

  // 받은 사진 주소가 낡으면 같은 조건으로 다시 찾는다. 숨겨지면(Activity) 정리되고, 다시 보일 때 바로 확인한다
  useEffect(() => {
    if (requestedAt === undefined) return;
    const refreshIfStale = (): boolean => {
      if (toMsUntilPhotoUrlsStale(requestedAt, Date.now()) > 0) return false;
      loadedKey.current = undefined;
      setRequestCount((count) => count + 1);
      return true;
    };
    if (refreshIfStale()) return;
    const timer = setTimeout(refreshIfStale, toMsUntilPhotoUrlsStale(requestedAt, Date.now()));
    const unsubscribe = subscribeToAppReturn(refreshIfStale);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [requestedAt]);

  const isCurrent = results?.key === key;
  // 받은 결과가 있어도 다시 찾다 실패했으면 실패를 보여 준다. 낡은 결과의 아직 받지 않은 사진은 깨진다
  const status: RecordSearchStatus = !isActive ? "idle" : failedKey === key ? "failed" : isCurrent ? "done" : "loading";

  const loadMore = () => {
    if (!results || !isCurrent || !results.next || results.isLoadingMore) return;
    const after = results.next;
    // 이어 받는 사이 다시 찾았으면 그 응답은 새 결과에 맞지 않아 버린다
    const startedFrom = results.requestedAt;
    const update = (change: (current: LoadedResults) => LoadedResults) =>
      setResults((current) => (current?.key === key && current.requestedAt === startedFrom ? change(current) : current));

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
    setRequestCount((count) => count + 1);
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
