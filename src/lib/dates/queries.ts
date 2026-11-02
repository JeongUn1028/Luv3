import "server-only";
import { createClient } from "@/lib/supabase/server";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { toAlbumTiles, type AlbumTile } from "./album";

/** 썸네일 서명 URL 유효 시간(초). 홈은 요청마다 새로 그리므로 화면을 오래 열어 둘 만큼만 둔다 */
const THUMB_URL_EXPIRES_IN = 60 * 60;

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
    .createSignedUrls(thumbPaths, THUMB_URL_EXPIRES_IN);
  if (signError) throw new AlbumLoadError({ cause: signError });

  return toAlbumTiles(rows, signed);
};
