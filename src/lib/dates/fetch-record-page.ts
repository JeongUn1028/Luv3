import { SESSION_LOST_EVENT } from "@/lib/auth/session-lost";
import { parseRecordSearchPage, RecordSearchError, toRecordSearchApiHref, type RecordSearchPage, type RecordSearchParams } from "./search-api";

const UNAUTHORIZED_STATUS = 401;

/**
 * 기록 한 묶음을 우리 API(`/api/records/search`)로 받는다. 찾기(#273)와 그리드 이어 받기(#274)가 함께 쓴다.
 *
 * @throws {RecordSearchError} 받지 못했거나 로그인이 풀렸을 때(`status` 401)
 * @example const page = await fetchRecordPage({ query: "", tag: undefined, after: pages.next })
 */
export const fetchRecordPage = async (params: RecordSearchParams, signal?: AbortSignal): Promise<RecordSearchPage> => {
  const response = await fetch(toRecordSearchApiHref(params), { signal });
  // 로그인이 풀리면 서버가 로그인 화면으로 보내고, fetch는 그 화면을 성공(200)으로 받아 온다
  if (response.redirected) throw new RecordSearchError({ status: UNAUTHORIZED_STATUS });
  if (!response.ok) throw new RecordSearchError({ status: response.status });
  return parseRecordSearchPage(await response.json());
};

/**
 * 로그인이 풀려 받지 못했으면, 보던 것을 잃지 않게 이 자리에서 다시 로그인하는 창을 띄운다.
 *
 * @example fetchRecordPage(params).catch(reportSessionLost)
 */
export const reportSessionLost = (error: unknown): void => {
  if (error instanceof RecordSearchError && error.status === UNAUTHORIZED_STATUS) window.dispatchEvent(new Event(SESSION_LOST_EVENT));
};
