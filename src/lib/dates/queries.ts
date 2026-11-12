import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { catchLoadError } from "@/lib/load";
import { getHomePhotoSignedUrls, getSignedUrls } from "@/lib/photos/signed-urls";
import { toLatestRecord, toTagSuggestions, type LatestRecord } from "./album";
import type { AlbumFirstPage } from "./album-pages";
import { PHOTO_GROUP_LOCATION_COLUMNS, toPhotoWithGroupLocation } from "./photo-groups";
import { isRecordId, toDateRecordDetail, toEditableRecord, type DateRecordDetail, type DetailRow, type EditableRecord } from "./detail";
import { ALL_RECORDS_FIRST_PAGE, loadRecordPage } from "./search-queries";

/** 앨범 그리드를 불러오지 못했을 때 */
export class AlbumLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "AlbumLoadError";
  }
}

class RecordsVersionLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록 판 번호를 불러오지 못했어요.", options);
    this.name = "RecordsVersionLoadError";
  }
}

const loadRecordsVersion = async (): Promise<string> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("date_records_version");
  if (error) throw new RecordsVersionLoadError({ cause: error });
  return data;
};

/**
 * 기록 탭 그리드의 첫 묶음(최신순 60개)과 모든 기록의 판 번호를 불러온다(#274). 나머지는 화면이 내리면서 이어 받는다.
 * 판 번호로 화면을 새로 받았을 때 이어 받아 둔 기록이 아직 맞는지 판단한다.
 * 판 번호를 먼저 읽는다. 그 사이 기록이 바뀌면 다음에 새로 받을 때 판 번호가 달라 처음부터 다시 받는다(거꾸로면 예전 기록을 맞다고 본다).
 * 판 번호를 못 읽어도 그리드는 보여 준다. 로그만 남기고 매번 다른 값을 줘, 새로 받을 때마다 처음부터 다시 받게 한다.
 *
 * @throws {AlbumLoadError} 기록 조회나 서명 URL 발급이 실패했을 때
 * @example const firstPage = await getAlbumFirstPage()
 */
export const getAlbumFirstPage = async (): Promise<AlbumFirstPage> => {
  const version = await catchLoadError(loadRecordsVersion, RecordsVersionLoadError);
  const { items, next, loadedAt } = await loadRecordPage(ALL_RECORDS_FIRST_PAGE, (cause) => new AlbumLoadError({ cause }));
  return { items, next, loadedAt, version: version instanceof RecordsVersionLoadError ? `unknown:${crypto.randomUUID()}` : version };
};

/**
 * 가장 최근 데이트 기록 하나(홈). 기록 탭 그리드의 첫 칸과 같은 기록이다.
 * 휴대폰이 주소를 기억해 다시 쓰므로(#219) 7일 주소(`getHomePhotoSignedUrls`)로 서명한다.
 *
 * @returns 기록이 없으면 undefined
 * @throws {AlbumLoadError} 기록 조회나 서명 URL 발급이 실패했을 때
 * @example const latest = await getLatestRecord()
 */
export const getLatestRecord = async (): Promise<LatestRecord | undefined> => {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("dates")
    .select("id, date, end_date, title, tags, cover:photos!dates_cover_photo_id_fkey(thumb_path)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) throw new AlbumLoadError({ cause: error });

  const thumbPaths = rows.flatMap(({ cover }) => (cover ? [cover.thumb_path] : []));
  const { data: signed, error: signError } = await getHomePhotoSignedUrls(supabase.storage.from(ALBUM_BUCKET), thumbPaths);
  if (signError) throw new AlbumLoadError({ cause: signError });

  return toLatestRecord(rows, signed);
};

class TagSuggestionLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("전에 쓴 태그를 불러오지 못했어요.", options);
    this.name = "TagSuggestionLoadError";
  }
}

const loadTagSuggestions = async (): Promise<string[]> => {
  const supabase = await createClient();
  // DB가 세어 태그 종류만큼만 받으므로 기록이 1000개를 넘어도 잘리지 않는다(#273). 종류가 1000개를 넘는 일은 없다고 본다
  const { data, error } = await supabase.rpc("count_date_tags");
  if (error) throw new TagSuggestionLoadError({ cause: error });
  return toTagSuggestions(data);
};

/**
 * 전에 쓴 태그를 많이 쓴 순서로 읽는다(작성 화면의 추천, 기록 탭 찾기의 태그 줄).
 * 태그를 못 읽어도 기록은 쓰고 찾을 수 있어, 실패하면 로그만 남기고 빈 목록을 돌려준다.
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
  `id, date, end_date, title, memo, cover_photo_id, tags, revision, author:members!dates_author_id_fkey(nickname), event_date, event:events(id, title, repeat_rule), groups:photo_groups!photo_groups_date_id_fkey(id, caption), photos!photos_date_id_fkey(id, group_id, path, thumb_path, sort_order, taken_at, ${PHOTO_GROUP_LOCATION_COLUMNS})` as const;

/** 기록 행 하나를 읽는다. id 형식이 틀리거나 없는 기록이면 undefined */
const getDetailRow = async (
  supabase: Awaited<ReturnType<typeof createClient>>,
  id: string,
): Promise<DetailRow | undefined> => {
  if (!isRecordId(id)) return undefined;
  const { data: row, error } = await supabase.from("dates").select(DETAIL_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new DateRecordLoadError({ cause: error });
  return row ? { ...row, photos: row.photos.map(toPhotoWithGroupLocation) } : undefined;
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
