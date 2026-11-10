import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { getSignedUrls } from "@/lib/photos/signed-urls";
import { toAlbumTiles } from "./album";
import { RECORD_SEARCH_PAGE_SIZE, toSearchWords, type RecordSearchPage, type RecordSearchParams } from "./search-api";

/** 서버에서 기록을 찾지 못했을 때(조회나 썸네일 서명 실패) */
export class RecordSearchLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 찾지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "RecordSearchLoadError";
  }
}

/**
 * 검색어·태그에 맞는 기록을 최신순(날짜 → 작성 시각)으로 한 묶음 찾고 대표 사진 썸네일을 서명한다(#273).
 * 검색어와 태그가 모두 비어 있으면 모든 기록을 같은 순서로 나눠 준다.
 *
 * @throws {RecordSearchLoadError} 조회나 서명 URL 발급이 실패했을 때
 * @example const page = await searchRecords({ query: "성수", tag: undefined, after: undefined })
 */
export const searchRecords = async ({ query, tag, after }: RecordSearchParams): Promise<RecordSearchPage> => {
  const supabase = await createClient();
  const { data: rows, error } = await supabase.rpc("search_date_records", {
    p_words: toSearchWords(query),
    p_tag: tag,
    p_before_date: after?.date,
    p_before_created_at: after?.createdAt,
    p_before_id: after?.id,
    p_limit: RECORD_SEARCH_PAGE_SIZE,
  });
  if (error) throw new RecordSearchLoadError({ cause: error });

  const thumbPaths = rows.flatMap(({ thumb_path: thumbPath }) => (thumbPath ? [thumbPath] : []));
  const { data: signed, error: signError } = await getSignedUrls(supabase.storage.from(ALBUM_BUCKET), thumbPaths);
  if (signError) throw new RecordSearchLoadError({ cause: signError });

  const items = toAlbumTiles(
    rows.map(({ thumb_path: thumbPath, ...row }) => ({ ...row, cover: thumbPath ? { thumb_path: thumbPath } : null })),
    signed,
  );
  const last = rows.at(-1);
  return {
    items,
    // 묶음마다 전체 수가 같이 온다. 다음 묶음이 비어 있으면 셀 행이 없으나, 화면은 첫 묶음의 수만 쓴다
    total: rows[0]?.total_count ?? 0,
    next: last && rows.length === RECORD_SEARCH_PAGE_SIZE ? { date: last.date, createdAt: last.created_at, id: last.id } : undefined,
  };
};
