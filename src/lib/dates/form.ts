import { toNextDay } from "@/lib/calendar/month";
import { countChars, isIsoDate } from "@/lib/form";
import type { Database } from "@/lib/supabase/database.types";

// 글자 수 제한은 DB check 제약(마이그레이션)과 같아야 한다
export const TITLE_MAX_LENGTH = 100;
export const PLACE_MAX_LENGTH = 100;
export const MEMO_MAX_LENGTH = 10_000;
export const CAPTION_MAX_LENGTH = 100;
export const TAG_MAX_LENGTH = 10;
/** 기록 하나에 붙일 수 있는 태그 수 */
export const MAX_TAGS = 5;
/** 작성 화면에 추천할 태그 수 */
const TAG_SUGGESTION_LIMIT = 12;
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
  /** 기간의 끝 날짜. undefined면 하루짜리, ""면 기간을 켰지만 아직 고르지 않은 상태 */
  endDate: string | undefined;
  title: string;
  place: string;
  memo: string;
  photos: Photo[];
  coverPhotoId: string | undefined;
  tags: string[];
}

/** 칸 이름 → 화면에 보여 줄 에러 문구. 사진 한마디는 `caption:<사진 id>` */
export type DraftErrors = Partial<Record<"date" | "endDate" | "title" | "place" | "memo" | "photos" | "tags" | `caption:${string}`, string>>;

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

  if (draft.endDate !== undefined) {
    if (!isIsoDate(draft.endDate)) errors.endDate = "끝 날짜를 골라 주세요.";
    else if (draft.endDate <= draft.date) errors.endDate = "끝 날짜는 시작 날짜보다 뒤여야 해요.";
    else if (draft.endDate > today) errors.endDate = "끝 날짜는 오늘까지 고를 수 있어요.";
  }

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
 * 끝 날짜 달력에서 고를 수 있는 첫날(시작 다음 날).
 * 시작이 비었거나 오늘이면 고를 수 있는 날이 없어 달력이 통째로 막히므로 제한을 두지 않고, 저장할 때 왜 안 되는지 알린다.
 *
 * @example getMinEndDate("2026-11-01", "2026-11-04") // "2026-11-02"
 */
export const getMinEndDate = (date: string, today: string): string | undefined =>
  isIsoDate(date) && date < today ? toNextDay(date) : undefined;

/** 일정에서 기록 작성으로 넘어갈 때 작성 폼에 미리 채울 값 */
export interface RecordPrefill {
  date: string;
  title: string;
  place: string;
}

/**
 * 지난 일정으로 기록을 남기는 작성 화면 주소. 날짜·제목·장소를 쿼리로 넘긴다.
 *
 * @example toNewRecordHref({ date: "2026-11-01", title: "산책", place: "" }) // "/dates/new?date=2026-11-01&title=%EC%82%B0%EC%B1%85"
 */
export const toNewRecordHref = ({ date, title, place }: RecordPrefill): string => {
  const query = new URLSearchParams({ date, title });
  if (place) query.set("place", place);
  return `/dates/new?${query.toString()}`;
};

const takeChars = (text: string, max: number): string => Array.from(text.trim()).slice(0, max).join("");

/**
 * 작성 화면 주소 쿼리를 폼 처음 값으로 읽는다. 쿼리가 없으면 undefined.
 * 주소는 손으로 바꿀 수 있어서, 없는 날짜·앞으로의 날짜는 비워 두고(저장 전에 날짜를 고르라고 알린다) 글자 수는 제한까지만 받는다.
 *
 * @example parseRecordPrefill({ date: "2026-11-01", title: "산책" }, "2026-11-02") // { date: "2026-11-01", title: "산책", place: "" }
 */
export const parseRecordPrefill = (
  params: Record<string, string | string[] | undefined>,
  today: string,
): RecordPrefill | undefined => {
  const { date, title, place } = params;
  if (date === undefined && title === undefined && place === undefined) return undefined;
  return {
    // 날짜를 받았는데 쓸 수 없으면 오늘로 바꾸지 않고 비워 둔다: 일정과 다른 날로 저장되지 않게 직접 고르게 한다
    date: date === undefined ? today : typeof date === "string" && isIsoDate(date) && date <= today ? date : "",
    title: typeof title === "string" ? takeChars(title, TITLE_MAX_LENGTH) : "",
    place: typeof place === "string" ? takeChars(place, PLACE_MAX_LENGTH) : "",
  };
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
 * 적은 태그를 다듬는다. 앞의 #은 습관처럼 붙이므로 지운다.
 *
 * @example normalizeTag(" #카페 ") // "카페"
 */
export const normalizeTag = (text: string): string => text.trim().replace(/^[#\s]+/, "").replace(/\s+/g, " ");

const addOneTag = (tags: string[], text: string): { tags: string[]; error?: string } => {
  const tag = normalizeTag(text);
  const isSameTag = (existing: string): boolean => existing.toLowerCase() === tag.toLowerCase();
  if (tag === "" || tags.some(isSameTag)) return { tags };
  if (countChars(tag) > TAG_MAX_LENGTH) return { tags, error: `태그는 ${TAG_MAX_LENGTH}자까지 적을 수 있어요.` };
  if (tags.length >= MAX_TAGS) return { tags, error: `태그는 ${MAX_TAGS}개까지 붙일 수 있어요.` };
  return { tags: [...tags, tag] };
};

/**
 * 태그를 더한다. 습관대로 `#카페 #여행`처럼 적으면 각각 더한다.
 * 이미 있으면 그대로 두고, 글자 수나 개수를 넘으면 하나도 더하지 않고 이유를 함께 돌려준다.
 *
 * @example addTag(["카페"], "#여행") // { tags: ["카페", "여행"] }
 */
export const addTag = (tags: string[], text: string): { tags: string[]; error?: string } => {
  let nextTags = tags;
  for (const part of text.split("#")) {
    const { tags: added, error } = addOneTag(nextTags, part);
    if (error) return { tags, error };
    nextTags = added;
  }
  return { tags: nextTags };
};

/**
 * 전에 쓴 태그에서 보여 줄 것을 고른다. 이미 붙인 태그를 뺀 뒤에 잘라, 붙인 만큼 추천이 줄지 않게 한다.
 *
 * @example pickTagSuggestions(["cafe", "여행"], ["Cafe"]) // ["여행"]
 */
export const pickTagSuggestions = (suggestions: string[], tags: string[]): string[] => {
  const used = new Set(tags.map((tag) => tag.toLowerCase()));
  return suggestions.filter((suggestion) => !used.has(suggestion.toLowerCase())).slice(0, TAG_SUGGESTION_LIMIT);
};

/**
 * 입력값을 기록 작성 함수(`create_date_record`) 인자로 바꾼다. 빈 장소·글·한마디와 넘기지 않은 끝 날짜는 DB 함수가 null로 저장한다.
 *
 * @throws {Error} 대표 사진이 없으면(검증을 거치지 않은 코드 실수)
 * @example await supabase.rpc("create_date_record", toCreateRecordArgs(recordId, draft))
 */
export const toCreateRecordArgs = (recordId: string, draft: DateRecordDraft): CreateDateRecordArgs => {
  if (!draft.coverPhotoId) throw new Error("대표 사진이 정해지지 않았습니다");
  return {
    p_id: recordId,
    p_date: draft.date,
    p_end_date: draft.endDate,
    p_title: draft.title.trim(),
    p_place: draft.place.trim(),
    p_memo: draft.memo.trim(),
    p_photos: draft.photos.map(({ id, caption }) => ({ id, caption: caption.trim() })),
    p_cover_photo_id: draft.coverPhotoId,
    p_tags: draft.tags,
  };
};
