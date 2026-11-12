import type { PlaceLocation } from "@/lib/places/location";
import { toNextDay } from "@/lib/calendar/month";
import { countChars, isIsoDate, isSameFormValue } from "@/lib/form";
import type { Database } from "@/lib/supabase/database.types";

// 글자 수 제한은 DB check 제약(마이그레이션)과 같아야 한다
export const TITLE_MAX_LENGTH = 100;
export const MEMO_MAX_LENGTH = 10_000;
export const CAPTION_MAX_LENGTH = 100;
export const TAG_MAX_LENGTH = 10;
/** 기록 하나에 붙일 수 있는 태그 수 */
export const MAX_TAGS = 5;
/** 작성 화면에 추천할 태그 수 */
const TAG_SUGGESTION_LIMIT = 12;
/** 사진 모음 하나에 올릴 수 있는 사진 수(create_date_record와 같다). 모음을 다루기 전(#298)에는 기록 전체가 모음 하나다 */
export const MAX_PHOTOS = 10;

/** 사진의 위치. 이름과 좌표가 늘 함께 있다. 저장하면 사진 모음의 위치(photo_groups)가 된다(#297) */
export interface PhotoLocation extends PlaceLocation {
  place: string;
}

export interface DraftPhoto {
  /** 업로드 전에 정해 두는 사진 id. Storage 경로와 `photos.id`에 같은 값을 쓴다 */
  id: string;
  caption: string;
  /** 사진을 찍은 곳. 없으면 undefined */
  location: PhotoLocation | undefined;
  /** 새로 고른 사진 파일에서 읽은 찍은 시각(시간대가 붙은 ISO 문자열). 저장된 사진의 시각은 DB가 바꾸지 않아 넘기지 않는다 */
  takenAt?: string;
}

/** 작성 화면의 입력값. 날짜는 YYYY-MM-DD 문자열 */
export interface DateRecordDraft<Photo extends DraftPhoto = DraftPhoto> {
  /** 앞선 저장이 실패로 끝났지만 저장됐을 수 있을 때의 기록 id. 실패 내용과 함께 보관해 다시 저장해도 기록이 둘이 되지 않게 한다 */
  uncertainSaveRecordId?: string;
  /** 저장을 허용할 판 번호: 불러온 때의 판과, 저장됐을 수 있는 내 앞선 시도의 판. 새 기록이면 없다 */
  expectedRevisions?: string[];
  /** 이번 저장으로 바뀔 판 번호. 저장을 시도할 때마다 새로 정한다 */
  nextRevision?: string;
  /** 상대가 먼저 고쳐 저장이 거부됐는지. 다시 저장해도 거부되므로 최신 내용을 불러오게 한다 */
  hasConflict?: boolean;
  date: string;
  /** 기간의 끝 날짜. undefined면 하루짜리, ""면 기간을 켰지만 아직 고르지 않은 상태 */
  endDate: string | undefined;
  title: string;
  memo: string;
  photos: Photo[];
  coverPhotoId: string | undefined;
  tags: string[];
  /** 일정에서 남기는 기록이면 어느 일정의 어느 날인지. 직접 쓰거나 고치는 기록은 없다 */
  eventLink?: RecordEventLink;
}

/** 기록을 남긴 일정과 그날(반복이면 그날, 아니면 시작일) */
export interface RecordEventLink {
  eventId: string;
  eventDate: string;
}

/** 칸 이름 → 화면에 보여 줄 에러 문구. 사진 한마디는 `caption:<사진 id>` */
export type DraftErrors = Partial<Record<"date" | "endDate" | "title" | "memo" | "photos" | "tags" | `caption:${string}`, string>>;

export type CreateDateRecordArgs = Database["public"]["Functions"]["create_date_record"]["Args"];

/**
 * `update_date_record`에 넘기는 값. 새 기록의 값에 판 번호가 더해진다.
 *
 * @example const args: UpdateDateRecordArgs = { ...toCreateRecordArgs(id, draft), p_expected_revisions: [revision], p_new_revision: next };
 */
export type UpdateDateRecordArgs = Database["public"]["Functions"]["update_date_record"]["Args"];

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

  if (tooLong(draft.memo.trim(), MEMO_MAX_LENGTH)) errors.memo = "정리 글은 10,000자까지 적을 수 있어요.";

  if (draft.photos.length === 0) errors.photos = "사진을 한 장 이상 골라 주세요.";
  else if (!findGroupLocation(draft.photos)) errors.photos = "위치가 있는 사진이 한 장 이상 있어야 저장할 수 있어요.";
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
  /** 기간 일정에서 넘어오면 끝 날짜 */
  endDate?: string | undefined;
  title: string;
  /** 일정의 메모(#227). 예전 주소(날짜·제목 쿼리)로 열면 없다 */
  memo?: string | undefined;
  /** 이 기록을 이을 일정. 예전 주소로 열면 없다 */
  eventLink?: RecordEventLink | undefined;
}

/**
 * 앞에서부터 글자 수만큼 자른다.
 *
 * @example takeChars(" 성수동 ", 2) // "성수"
 */
export const takeChars = (text: string, max: number): string => Array.from(text.trim()).slice(0, max).join("");

/**
 * 작성 화면 주소 쿼리를 폼 처음 값으로 읽는다. 쿼리가 없으면 undefined.
 * 주소는 손으로 바꿀 수 있어서, 없는 날짜·앞으로의 날짜는 비워 두고(저장 전에 날짜를 고르라고 알린다) 글자 수는 제한까지만 받는다.
 *
 * @example parseRecordPrefill({ date: "2026-11-01", title: "산책" }, "2026-11-02") // { date: "2026-11-01", title: "산책" }
 */
export const parseRecordPrefill = (
  params: Record<string, string | string[] | undefined>,
  today: string,
): RecordPrefill | undefined => {
  // 예전 주소의 장소 쿼리는 기록 장소 칸을 없애(#296) 읽지 않는다
  const { date, endDate, title } = params;
  if (date === undefined && title === undefined) return undefined;
  // 날짜를 받았는데 쓸 수 없으면 오늘로 바꾸지 않고 비워 둔다: 일정과 다른 날로 저장되지 않게 직접 고르게 한다
  const startDate = date === undefined ? today : typeof date === "string" && isIsoDate(date) && date <= today ? date : "";
  return {
    date: startDate,
    // 쓸 수 없는 끝 날짜는 받지 않아 하루 기록으로 시작한다
    endDate: typeof endDate === "string" && isIsoDate(endDate) && startDate !== "" && startDate < endDate && endDate <= today ? endDate : undefined,
    title: typeof title === "string" ? takeChars(title, TITLE_MAX_LENGTH) : "",
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
 * 사진 하나의 위치를 바꾼다. `undefined`면 지운다.
 *
 * @example setPhotoLocation(photos, photoId, { place: "서울숲", lat: 37.54, lng: 127.03 })
 */
export const setPhotoLocation = <Photo extends DraftPhoto>(photos: Photo[], photoId: string, location: PhotoLocation | undefined): Photo[] =>
  photos.map((photo) => (photo.id === photoId ? { ...photo, location } : photo));

/**
 * 두 위치가 같은 곳인지(이름·좌표가 모두 같은지) 알려 준다. 둘 다 없어도 같다.
 *
 * @example isSamePhotoLocation(previous, current) // true면 "앞 사진과 같은 곳"을 고를 필요가 없다
 */
export const isSamePhotoLocation = (left: PhotoLocation | undefined, right: PhotoLocation | undefined): boolean =>
  left?.place === right?.place && left?.lat === right?.lat && left?.lng === right?.lng;

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
 * 사진 모음의 위치: 위치가 있는 첫 사진의 위치. 모음은 장소 하나라 위치가 하나다(#297).
 * 지도에서 고르기(#298) 전까지는 사진 정보나 "앞 사진과 같은 곳"으로 정한 위치만 있다.
 *
 * @example findGroupLocation(draft.photos) // { place: "성수동", lat: 37.54, lng: 127.05 }
 */
export const findGroupLocation = (photos: DraftPhoto[]): PhotoLocation | undefined => photos.find(({ location }) => location)?.location;

/**
 * 입력값을 기록 작성 함수(`create_date_record`) 인자로 바꾼다. 빈 글·한마디와 넘기지 않은 끝 날짜는 DB 함수가 null로 저장한다.
 *
 * @throws {Error} 대표 사진이나 위치가 있는 사진이 없으면(검증을 거치지 않은 코드 실수)
 * @example await supabase.rpc("create_date_record", toCreateRecordArgs(recordId, draft))
 */
export const toCreateRecordArgs = (recordId: string, draft: DateRecordDraft): CreateDateRecordArgs => {
  if (!draft.coverPhotoId) throw new Error("대표 사진이 정해지지 않았습니다");
  const location = findGroupLocation(draft.photos);
  if (!location) throw new Error("위치가 있는 사진이 없습니다");
  return {
    p_id: recordId,
    p_date: draft.date,
    p_end_date: draft.endDate,
    p_title: draft.title.trim(),
    p_memo: draft.memo.trim(),
    // TODO(#298): 폼이 모음을 다루면 모음마다 넘긴다. 그전까지는 사진 전체를 모음 하나로 묶는다.
    // 모음 id는 기록 id를 그대로 써, 같은 저장을 다시 보내도 같은 모음이 된다(모음 id는 기록마다 하나라 겹치지 않는다)
    p_groups: [
      {
        id: recordId,
        location: { place: location.place, lat: location.lat, lng: location.lng },
        photos: draft.photos.map(({ id, caption, takenAt }) => ({
          id,
          caption: caption.trim(),
          ...(takenAt !== undefined && { taken_at: takenAt }),
        })),
      },
    ],
    p_cover_photo_id: draft.coverPhotoId,
    p_event_id: draft.eventLink?.eventId,
    p_event_date: draft.eventLink?.eventDate,
    p_tags: draft.tags,
  };
};

// 저장 시도에 쓰는 칸(판 번호 등)과 사진 파일·미리보기 주소는 사용자가 쓴 내용이 아니라 비교에서 뺀다
const toWrittenContent = ({ date, endDate, title, memo, photos, coverPhotoId, tags }: DateRecordDraft) => ({
  date,
  endDate,
  title,
  memo,
  photos: photos.map((photo) => ({ id: photo.id, caption: photo.caption, location: photo.location })),
  coverPhotoId,
  tags,
});

/**
 * 기록 폼에 쓴 내용이 처음과 다른지 알려 준다. 다르면 뒤로 버튼을 누를 때 버릴지 묻는다(#165).
 *
 * @example hasRecordDraftChanges(initialDraft, draft) // true
 */
export const hasRecordDraftChanges = (initial: DateRecordDraft, current: DateRecordDraft): boolean =>
  !isSameFormValue(toWrittenContent(initial), toWrittenContent(current));

/**
 * `discarded`에서 사진 정보를 읽는 중이던 사진에 찍은 곳·찍은 시각이 채워진 것 말고는 쓴 내용이 같은지 알려 준다.
 * 나가기를 고른 뒤 늦게 도착한 사진 정보는 사람이 계속 쓴 것이 아니므로, 숨겨질 때 그대로 버린다(#284, #249).
 *
 * @example isSameExceptReadingPhotoInfo(draftWhenDiscarded, draft) // true
 */
export const isSameExceptReadingPhotoInfo = <Photo extends DraftPhoto & { isReadingInfo: boolean }>(
  discarded: DateRecordDraft<Photo>,
  current: DateRecordDraft<Photo>,
): boolean => {
  const readingIds = new Set(discarded.photos.filter(({ isReadingInfo }) => isReadingInfo).map(({ id }) => id));
  const withoutReadingInfo = (draft: DateRecordDraft<Photo>): DateRecordDraft =>
    ({ ...draft, photos: draft.photos.map((photo) => (readingIds.has(photo.id) ? { ...photo, location: undefined } : photo)) });
  return !hasRecordDraftChanges(withoutReadingInfo(discarded), withoutReadingInfo(current));
};
