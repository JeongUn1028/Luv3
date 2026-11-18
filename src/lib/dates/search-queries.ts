import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";
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

type RecordSearchRow = Database["public"]["Functions"]["search_date_records"]["Returns"][number];

/** 한 묶음을 받을 때 DB에 달라는 줄 수. 하나 더 받아 다음 묶음이 있는지 안다. 맞는 기록이 60의 배수일 때 빈 묶음을 한 번 더 부르지 않는다 */
export const RECORD_PAGE_FETCH_SIZE = RECORD_SEARCH_PAGE_SIZE + 1;

interface ToSignedRecordPageParams {
  supabase: Awaited<ReturnType<typeof createClient>>;
  /** DB가 준 줄(`RECORD_PAGE_FETCH_SIZE`개까지) */
  found: readonly RecordSearchRow[];
  toError: (cause: unknown) => Error;
}

/**
 * DB가 준 기록 줄을 한 묶음으로 자르고 대표 사진 썸네일을 서명한다. 기록 찾기와 기록 탭 첫 묶음(`album_first_page`)이 같이 쓴다.
 *
 * @example const page = await toSignedRecordPage({ supabase, found, toError: (cause) => new AlbumLoadError({ cause }) })
 */
export const toSignedRecordPage = async ({ supabase, found, toError }: ToSignedRecordPageParams): Promise<RecordSearchPage> => {
  const rows = found.slice(0, RECORD_SEARCH_PAGE_SIZE);

  // 서명하기 전에 잰다. 서명 주소는 이때부터 적어도 SIGNED_URL_MIN_REMAINING 동안 쓸 수 있다
  const loadedAt = Date.now();
  const thumbPaths = rows.flatMap(({ thumb_path: thumbPath }) => (thumbPath ? [thumbPath] : []));
  const { data: signed, error: signError } = await getSignedUrls(supabase.storage.from(ALBUM_BUCKET), thumbPaths);
  if (signError) throw toError(signError);

  const items = toAlbumTiles(
    rows.map(({ thumb_path: thumbPath, ...row }) => ({ ...row, cover: thumbPath ? { thumb_path: thumbPath } : null })),
    signed,
  );
  const last = rows.at(-1);
  return {
    items,
    // DB는 첫 묶음에서만 전체 수를 센다. 화면도 첫 묶음의 수만 쓴다
    total: rows[0]?.total_count ?? 0,
    next: last && found.length > RECORD_SEARCH_PAGE_SIZE ? { date: last.date, createdAt: last.created_at, id: last.id } : undefined,
    loadedAt,
  };
};

/**
 * 검색어·태그에 맞는 기록을 최신순(날짜 → 작성 시각)으로 한 묶음 찾고 대표 사진 썸네일을 서명한다.
 * 검색어와 태그가 모두 비어 있으면 모든 기록을 같은 순서로 나눠 준다. 실패하면 `toError`가 만든 에러를 던진다(부르는 화면마다 문구가 다르다).
 *
 * @example const page = await loadRecordPage({ query: "성수", tag: undefined, after: undefined }, (cause) => new RecordSearchLoadError({ cause }))
 */
export const loadRecordPage = async ({ query, tag, after }: RecordSearchParams, toError: (cause: unknown) => Error): Promise<RecordSearchPage> => {
  const supabase = await createClient();
  const { data: found, error } = await supabase.rpc("search_date_records", {
    p_words: toSearchWords(query),
    p_tag: tag,
    p_before_date: after?.date,
    p_before_created_at: after?.createdAt,
    p_before_id: after?.id,
    p_limit: RECORD_PAGE_FETCH_SIZE,
  });
  if (error) throw toError(error);
  return toSignedRecordPage({ supabase, found, toError });
};

/**
 * 기록 찾기(#273)와 그리드 이어 받기(#274)가 부르는 한 묶음.
 *
 * @throws {RecordSearchLoadError} 조회나 서명 URL 발급이 실패했을 때
 * @example const page = await searchRecords({ query: "성수", tag: undefined, after: undefined })
 */
export const searchRecords = (params: RecordSearchParams): Promise<RecordSearchPage> =>
  loadRecordPage(params, (cause) => new RecordSearchLoadError({ cause }));
