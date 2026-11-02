import { countChars, isIsoDate } from "@/lib/form";
import type { Database } from "@/lib/supabase/database.types";

// 글자 수 제한은 DB check 제약(마이그레이션)과 같아야 한다
export const TITLE_MAX_LENGTH = 100;
export const PLACE_MAX_LENGTH = 100;
export const MEMO_MAX_LENGTH = 10_000;
export const CAPTION_MAX_LENGTH = 100;
/** 기록 하나에 올릴 수 있는 사진 수(create_date_record와 같다) */
export const MAX_PHOTOS = 10;

export interface DraftPhoto {
  /** 업로드 전에 정해 두는 사진 id. Storage 경로와 `photos.id`에 같은 값을 쓴다 */
  id: string;
  caption: string;
}

/** 작성 화면의 입력값. 날짜는 YYYY-MM-DD 문자열(input type="date" 값) */
export interface DateRecordDraft<Photo extends DraftPhoto = DraftPhoto> {
  date: string;
  title: string;
  place: string;
  memo: string;
  photos: Photo[];
  coverPhotoId: string | undefined;
}

/** 칸 이름 → 화면에 보여 줄 에러 문구. 사진 한마디는 `caption:<사진 id>` */
export type DraftErrors = Partial<Record<"date" | "title" | "place" | "memo" | "photos" | `caption:${string}`, string>>;

export type CreateDateRecordArgs = Database["public"]["Functions"]["create_date_record"]["Args"];

const tooLong = (text: string, max: number): boolean => countChars(text) > max;

/**
 * 저장 전에 입력값을 확인해 칸마다 에러 문구를 돌려준다. 문제가 없으면 빈 객체다.
 * 다녀온 데이트를 남기는 화면이라 오늘(한국 날짜)보다 뒤의 날짜는 받지 않는다.
 *
 * @example validateDraft(draft, "2026-11-02") // { title: "제목을 적어 주세요." }
 */
export const validateDraft = (draft: DateRecordDraft, today: string): DraftErrors => {
  const errors: DraftErrors = {};

  if (!isIsoDate(draft.date)) errors.date = "날짜를 골라 주세요.";
  else if (draft.date > today) errors.date = "다녀온 날짜를 골라 주세요. 앞으로의 약속은 캘린더에 적어요.";

  if (draft.title.trim() === "") errors.title = "제목을 적어 주세요.";
  else if (tooLong(draft.title.trim(), TITLE_MAX_LENGTH)) errors.title = "제목은 100자까지 적을 수 있어요.";

  if (tooLong(draft.place.trim(), PLACE_MAX_LENGTH)) errors.place = "장소는 100자까지 적을 수 있어요.";
  if (tooLong(draft.memo.trim(), MEMO_MAX_LENGTH)) errors.memo = "정리 글은 10,000자까지 적을 수 있어요.";

  if (draft.photos.length === 0) errors.photos = "사진을 한 장 이상 골라 주세요.";
  for (const photo of draft.photos) {
    if (tooLong(photo.caption.trim(), CAPTION_MAX_LENGTH)) {
      errors[`caption:${photo.id}`] = "한마디는 100자까지 적을 수 있어요.";
    }
  }

  return errors;
};

/**
 * 고른 사진을 뒤에 붙인다. 10장을 넘는 사진은 버리고, 대표 사진이 없으면 첫 사진을 대표로 정한다.
 *
 * @example addPhotos(draft, [{ id, caption: "" }]) // { draft: { ...draft, photos: [...] }, droppedCount: 0 }
 */
export const addPhotos = <Photo extends DraftPhoto>(
  draft: DateRecordDraft<Photo>,
  added: Photo[],
): { draft: DateRecordDraft<Photo>; droppedCount: number } => {
  const room = Math.max(MAX_PHOTOS - draft.photos.length, 0);
  const photos = [...draft.photos, ...added.slice(0, room)];
  return {
    draft: { ...draft, photos, coverPhotoId: draft.coverPhotoId ?? photos[0]?.id },
    droppedCount: Math.max(added.length - room, 0),
  };
};

/**
 * 사진을 뺀다. 대표 사진을 빼면 남은 첫 사진이 대표가 된다.
 *
 * @example removePhoto(draft, photoId)
 */
export const removePhoto = <Photo extends DraftPhoto>(
  draft: DateRecordDraft<Photo>,
  photoId: string,
): DateRecordDraft<Photo> => {
  const photos = draft.photos.filter(({ id }) => id !== photoId);
  const coverPhotoId = draft.coverPhotoId === photoId ? photos[0]?.id : draft.coverPhotoId;
  return { ...draft, photos, coverPhotoId };
};

/**
 * 사진 하나를 앞(-1)이나 뒤(+1)로 옮긴다. 범위를 넘으면 그대로 돌려준다.
 *
 * @example movePhoto(photos, 2, -1) // 세 번째 사진을 두 번째로
 */
export const movePhoto = <Photo>(photos: Photo[], index: number, offset: -1 | 1): Photo[] => {
  const target = index + offset;
  if (index < 0 || index >= photos.length || target < 0 || target >= photos.length) return photos;
  const moved = [...photos];
  [moved[index], moved[target]] = [moved[target], moved[index]];
  return moved;
};

/**
 * 입력값을 기록 작성 함수(`create_date_record`) 인자로 바꾼다. 빈 장소·글·한마디는 DB 함수가 null로 저장한다.
 *
 * @throws {Error} 대표 사진이 없으면(검증을 거치지 않은 코드 실수)
 * @example await supabase.rpc("create_date_record", toCreateRecordArgs(recordId, draft))
 */
export const toCreateRecordArgs = (recordId: string, draft: DateRecordDraft): CreateDateRecordArgs => {
  if (!draft.coverPhotoId) throw new Error("대표 사진이 정해지지 않았습니다");
  return {
    p_id: recordId,
    p_date: draft.date,
    p_title: draft.title.trim(),
    p_place: draft.place.trim(),
    p_memo: draft.memo.trim(),
    p_photos: draft.photos.map(({ id, caption }) => ({ id, caption: caption.trim() })),
    p_cover_photo_id: draft.coverPhotoId,
  };
};
