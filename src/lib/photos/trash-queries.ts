import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isRecordId } from "@/lib/dates/detail";
import { ALBUM_BUCKET } from "./limits";
import { getSignedUrls } from "./signed-urls";
import { toTrashPhotoDetail, toTrashSections, type TrashPhotoDetail, type TrashSection } from "./trash-view";

/** 휴지통을 불러오지 못했을 때(없는 사진은 이 에러가 아니라 undefined) */
export class TrashLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("휴지통을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", options);
    this.name = "TrashLoadError";
  }
}

const TRASH_COLUMNS = "id, date_id, path, thumb_path, record_date, record_title, taken_at, deleted_with_record, deleted_at" as const;

/**
 * 휴지통 사진을 최근에 지운 순서로 읽어 기록·지운 날마다 묶고 썸네일에 서명 주소를 붙인다.
 * 두 사람이 30~61일 동안 지운 사진만 남으므로 나눠 받지 않는다.
 *
 * @throws {TrashLoadError} 조회나 서명 주소 발급이 실패했을 때
 * @example const sections = await getTrashSections(new Date())
 */
export const getTrashSections = async (now: Date): Promise<TrashSection[]> => {
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("photo_trash")
    .select(TRASH_COLUMNS)
    .order("deleted_at", { ascending: false })
    .order("taken_at", { ascending: true, nullsFirst: false })
    .order("id");
  if (error) throw new TrashLoadError({ cause: error });

  const { data: signed, error: signError } = await getSignedUrls(
    supabase.storage.from(ALBUM_BUCKET),
    rows.map(({ thumb_path: thumbPath }) => thumbPath),
  );
  if (signError) throw new TrashLoadError({ cause: signError });
  return toTrashSections(rows, signed, now);
};

/**
 * 휴지통 사진 한 장을 읽고 원본에 서명 주소를 붙인다.
 *
 * @returns 없는 사진(그사이 정리됐거나 id 형식이 틀림)이면 undefined
 * @throws {TrashLoadError} 조회나 서명 주소 발급이 실패했을 때
 * @example const photo = await getTrashPhoto(id, new Date()); if (!photo) notFound()
 */
export const getTrashPhoto = async (id: string, now: Date): Promise<TrashPhotoDetail | undefined> => {
  // uuid 칸에 다른 글자를 넘기면 DB가 오류를 내므로 묻지 않고 없는 사진으로 본다
  if (!isRecordId(id)) return undefined;
  const supabase = await createClient();
  const { data: row, error } = await supabase.from("photo_trash").select(TRASH_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw new TrashLoadError({ cause: error });
  if (!row) return undefined;

  const { data: signed, error: signError } = await getSignedUrls(supabase.storage.from(ALBUM_BUCKET), [row.path]);
  if (signError) throw new TrashLoadError({ cause: signError });
  return toTrashPhotoDetail(row, signed, now);
};
