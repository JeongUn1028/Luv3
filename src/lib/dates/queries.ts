import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { catchLoadError } from "@/lib/load";
import { getSignedUrls } from "@/lib/photos/signed-urls";
import { toAlbumTiles, toTagSuggestions, type AlbumTile } from "./album";
import { isRecordId, toDateRecordDetail, toEditableRecord, type DateRecordDetail, type DetailRow, type EditableRecord } from "./detail";

/** 앨범 그리드를 불러오지 못했을 때 */
export class AlbumLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "AlbumLoadError";
  }
}

/** 최신순(날짜 → 작성 시각) 기록을 `limit`개까지(없으면 전부) 읽고 대표 사진 썸네일 서명 URL을 붙인다 */
const loadLatestTiles = async (limit?: number): Promise<AlbumTile[]> => {
  const supabase = await createClient();
  const query = supabase
    .from("dates")
    .select("id, date, end_date, title, place, memo, tags, cover:photos!dates_cover_photo_id_fkey(thumb_path), photos!photos_date_id_fkey(caption)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  const { data: rows, error } = await (limit === undefined ? query : query.limit(limit));
  if (error) throw new AlbumLoadError({ cause: error });

  const thumbPaths = rows.flatMap(({ cover }) => (cover ? [cover.thumb_path] : []));
  const { data: signed, error: signError } = await getSignedUrls(supabase.storage.from(ALBUM_BUCKET), thumbPaths);
  if (signError) throw new AlbumLoadError({ cause: signError });

  return toAlbumTiles(rows, signed);
};

/**
 * 앨범 그리드에 그릴 기록을 최신순(날짜 → 작성 시각)으로 불러온다. 대표 사진 썸네일에 서명 URL을 붙인다.
 *
 * @throws {AlbumLoadError} 기록 조회나 서명 URL 발급이 실패했을 때
 * @example const tiles = await getAlbumTiles()
 */
export const getAlbumTiles = async (): Promise<AlbumTile[]> => loadLatestTiles();

/**
 * 가장 최근 데이트 기록 하나(홈). 기록 탭 그리드의 첫 칸과 같은 기록이다.
 *
 * @returns 기록이 없으면 undefined
 * @throws {AlbumLoadError} 기록 조회나 서명 URL 발급이 실패했을 때
 * @example const latest = await getLatestRecord()
 */
export const getLatestRecord = async (): Promise<AlbumTile | undefined> => (await loadLatestTiles(1))[0];

class TagSuggestionLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("전에 쓴 태그를 불러오지 못했어요.", options);
    this.name = "TagSuggestionLoadError";
  }
}

const loadTagSuggestions = async (): Promise<string[]> => {
  const supabase = await createClient();
  const { data, error } = await supabase.from("dates").select("tags");
  if (error) throw new TagSuggestionLoadError({ cause: error });
  return toTagSuggestions(data.map(({ tags }) => tags));
};

/**
 * 전에 쓴 태그를 많이 쓴 순서로 읽는다(작성 화면의 추천).
 * 추천을 못 읽어도 기록은 쓸 수 있어, 실패하면 로그만 남기고 빈 목록을 돌려준다.
 *
 * @example const suggestions = await getTagSuggestions()
 */
export const getTagSuggestions = async (): Promise<string[]> => {
  const suggestions = await catchLoadError(loadTagSuggestions, TagSuggestionLoadError);
  return suggestions instanceof TagSuggestionLoadError ? [] : suggestions;
};

/** 기록 상세를 불러오지 못했을 때(없는 기록은 이 에러가 아니라 undefined) */
export class DateRecordLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "DateRecordLoadError";
  }
}

const DETAIL_COLUMNS =
  "id, date, end_date, title, place, memo, cover_photo_id, tags, author:members!dates_author_id_fkey(nickname), photos!photos_date_id_fkey(id, path, thumb_path, caption, sort_order)";

/** 기록 행 하나를 읽는다. id 형식이 틀리거나 없는 기록이면 undefined */
const getDetailRow = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<DetailRow | undefined> => {
  if (!isRecordId(id)) return undefined;
  const { data: row, error } = await supabase.from("dates").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new DateRecordLoadError({ cause: error });
  return row ?? undefined;
};

const signPaths = async (supabase: Awaited<ReturnType<typeof createClient>>, paths: string[]) => {
  const { data, error } = await getSignedUrls(supabase.storage.from(ALBUM_BUCKET), paths);
  if (error) throw new DateRecordLoadError({ cause: error });
  return data;
};

/**
 * 기록 하나와 사진 전체를 불러오고, 원본 사진에 서명 URL을 붙인다.
 *
 * @returns 없는 기록이거나 id 형식이 틀리면 undefined
 * @throws {DateRecordLoadError} 조회나 서명 URL 발급이 실패했을 때
 * @example const record = await getDateRecordDetail(id); if (!record) notFound()
 */
export const getDateRecordDetail = async (id: string): Promise<DateRecordDetail | undefined> => {
  const supabase = await createClient();
  const row = await getDetailRow(supabase, id);
  if (!row) return undefined;
  return toDateRecordDetail(row, await signPaths(supabase, row.photos.map(({ path }) => path)));
};

/**
 * 수정 화면 초기값을 불러온다. 미리보기용으로 썸네일에 서명 URL을 붙인다.
 *
 * @returns 없는 기록이거나 id 형식이 틀리면 undefined
 * @throws {DateRecordLoadError} 조회나 서명 URL 발급이 실패했을 때
 * @example const record = await getEditableRecord(id); if (!record) notFound()
 */
export const getEditableRecord = async (id: string): Promise<EditableRecord | undefined> => {
  const supabase = await createClient();
  const row = await getDetailRow(supabase, id);
  if (!row) return undefined;
  return toEditableRecord(row, await signPaths(supabase, row.photos.map(({ thumb_path }) => thumb_path)));
};
