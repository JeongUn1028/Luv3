import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { toAlbumTiles, type AlbumTile } from "./album";
import { isRecordId, toDateRecordDetail, toEditableRecord, type DateRecordDetail, type DetailRow, type EditableRecord } from "./detail";

/**
 * 서명 URL 유효 시간(초). 화면은 요청마다 새로 그리고 한 번 불러온 사진은 브라우저가 들고 있으므로,
 * 화면을 오래 열어 둘 만큼만 두고 주소가 밖으로 새어도 오래 쓰이지 않게 한다
 */
const SIGNED_URL_EXPIRES_IN = 60 * 60;

/** 앨범 그리드를 불러오지 못했을 때 */
export class AlbumLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "AlbumLoadError";
  }
}

/**
 * 앨범 그리드에 그릴 기록을 최신순(날짜 → 작성 시각)으로 불러온다. 대표 사진 썸네일 서명 URL은 한 번에 발급한다.
 *
 * @throws {AlbumLoadError} 기록 조회나 서명 URL 발급이 실패했을 때
 * @example const tiles = await getAlbumTiles()
 */
export const getAlbumTiles = async (): Promise<AlbumTile[]> => {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("dates")
    .select("id, date, title, place, cover:photos!dates_cover_photo_id_fkey(thumb_path)")
    .order("date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new AlbumLoadError({ cause: error });

  const thumbPaths = rows.flatMap(({ cover }) => (cover ? [cover.thumb_path] : []));
  if (thumbPaths.length === 0) return toAlbumTiles(rows, []);

  const { data: signed, error: signError } = await supabase.storage
    .from(ALBUM_BUCKET)
    .createSignedUrls(thumbPaths, SIGNED_URL_EXPIRES_IN);
  if (signError) throw new AlbumLoadError({ cause: signError });

  return toAlbumTiles(rows, signed);
};

/** 기록 상세를 불러오지 못했을 때(없는 기록은 이 에러가 아니라 undefined) */
export class DateRecordLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("기록을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "DateRecordLoadError";
  }
}

const DETAIL_COLUMNS =
  "id, date, title, place, memo, cover_photo_id, photos!photos_date_id_fkey(id, path, thumb_path, caption, sort_order)";

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
  if (paths.length === 0) return [];
  const { data, error } = await supabase.storage.from(ALBUM_BUCKET).createSignedUrls(paths, SIGNED_URL_EXPIRES_IN);
  if (error) throw new DateRecordLoadError({ cause: error });
  return data;
};

/**
 * 기록 하나와 사진 전체를 불러오고, 원본 사진 서명 URL을 한 번에 발급한다.
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
 * 수정 화면 초기값을 불러온다. 미리보기용으로 썸네일 서명 URL을 발급한다.
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
