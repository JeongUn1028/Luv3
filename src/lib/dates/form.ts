import type { PlaceLocation } from "@/lib/places/location";
import { toNextDay } from "@/lib/calendar/month";
import { countChars, isIsoDate, isSameFormValue } from "@/lib/form";
import type { Database } from "@/lib/supabase/database.types";

// 글자 수 제한은 DB check 제약(마이그레이션)과 같아야 한다
export const TITLE_MAX_LENGTH = 100;
export const MEMO_MAX_LENGTH = 10_000;
export const CAPTION_MAX_LENGTH = 100;
/** 모음 장소 이름(#317). 기록 상세 사진 아래 한 줄에 들어가는 길이다 */
export const PLACE_NAME_MAX_LENGTH = 30;
export const TAG_MAX_LENGTH = 10;
/** 기록 하나에 붙일 수 있는 태그 수 */
export const MAX_TAGS = 5;
/** 작성 화면에 추천할 태그 수 */
const TAG_SUGGESTION_LIMIT = 12;

/** 사진 모음의 위치. 이름과 좌표가 늘 함께 있다(photo_groups, #297) */
export interface PhotoLocation extends PlaceLocation {
  place: string;
}

export interface DraftPhoto {
  /** 업로드 전에 정해 두는 사진 id. Storage 경로와 `photos.id`에 같은 값을 쓴다 */
  id: string;
  /**
   * 찍은 시각(시간대가 붙은 ISO 문자열). 새로 고른 사진은 파일에서 읽고, 저장된 사진은 불러온 값이다.
   * 모음 순서를 정할 때 쓰고, DB는 이미 있는 사진의 시각을 바꾸지 않는다
   */
  takenAt?: string;
}

/** 위치를 어디서 정했는지. 위치 줄의 설명에 쓴다. `saved`는 이미 저장된 모음이다 */
export type GroupLocationSource = "photo" | "picked" | "saved";

/** 한 번에 고른 사진 묶음(#298). 모음 하나가 장소 하나라 위치·장소 이름(#317)·한마디(#309)가 하나다 */
export interface DraftPhotoGroup<Photo extends DraftPhoto = DraftPhoto> {
  /** 업로드 전에 정해 두는 모음 id. `photo_groups.id`에 같은 값을 쓴다 */
  id: string;
  /** 모음 위치. 첫 사진에 위치가 없으면 지도에서 고를 때까지 undefined다 */
  location: PhotoLocation | undefined;
  locationSource: GroupLocationSource | undefined;
  /** 위치를 읽어 올 첫 사진(모음을 만들 때의 첫 사진). 그 사진 정보가 도착하면 지운다 */
  pendingLocationPhotoId: string | undefined;
  /** 사용자가 붙이는 장소 이름(선택, 30자). 비우면 행정동 이름을 다듬어 보여 준다(#317) */
  placeName: string;
  /** 모음 한마디(선택, 100자). 사진마다 두던 한마디를 모음마다 하나로 옮겼다(#309) */
  caption: string;
  photos: Photo[];
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
  groups: DraftPhotoGroup<Photo>[];
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

/** 칸 이름 → 화면에 보여 줄 에러 문구. 모음 한마디는 `caption:<모음 id>`, 장소 이름은 `placeName:<모음 id>`, 모음 위치는 `group:<모음 id>` */
export type DraftErrors = Partial<
  Record<"date" | "endDate" | "title" | "memo" | "photos" | "tags" | `caption:${string}` | `placeName:${string}` | `group:${string}`, string>
>;

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

  if (draft.groups.length === 0) errors.photos = "사진을 한 장 이상 골라 주세요.";
  for (const group of draft.groups) {
    if (!group.location) errors[`group:${group.id}`] = "위치를 골라야 저장할 수 있어요.";
    if (tooLong(group.placeName.trim(), PLACE_NAME_MAX_LENGTH)) errors[`placeName:${group.id}`] = "장소 이름은 30자까지 적을 수 있어요.";
    if (tooLong(group.caption.trim(), CAPTION_MAX_LENGTH)) errors[`caption:${group.id}`] = "한마디는 100자까지 적을 수 있어요.";
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
  /** 일정의 메모(#227) */
  memo: string;
  /** 이 기록을 이을 일정 */
  eventLink: RecordEventLink;
}

/**
 * 앞에서부터 글자 수만큼 자른다.
 *
 * @example takeChars(" 성수동 ", 2) // "성수"
 */
export const takeChars = (text: string, max: number): string => Array.from(text.trim()).slice(0, max).join("");

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
 * 입력값을 기록 작성 함수(`create_date_record`) 인자로 바꾼다. 빈 글·장소 이름·한마디와 넘기지 않은 끝 날짜는 DB 함수가 null로 저장한다.
 * 모음은 화면 순서대로 넘기고, DB가 모음 순서·모음 안 순서대로 사진 순서를 매긴다.
 *
 * @throws {Error} 대표 사진이 없거나 위치가 없는 모음이 있으면(검증을 거치지 않은 코드 실수)
 * @example await supabase.rpc("create_date_record", toCreateRecordArgs(recordId, draft))
 */
export const toCreateRecordArgs = (recordId: string, draft: DateRecordDraft): CreateDateRecordArgs => {
  if (!draft.coverPhotoId) throw new Error("대표 사진이 정해지지 않았습니다");
  return {
    p_id: recordId,
    p_date: draft.date,
    p_end_date: draft.endDate,
    p_title: draft.title.trim(),
    p_memo: draft.memo.trim(),
    p_groups: draft.groups.map(({ id, location, placeName, caption, photos }) => {
      if (!location) throw new Error(`위치가 없는 모음입니다: ${id}`);
      return {
        id,
        location: { place: location.place, lat: location.lat, lng: location.lng },
        place_name: placeName.trim(),
        caption: caption.trim(),
        photos: photos.map((photo) => ({ id: photo.id, ...(photo.takenAt !== undefined && { taken_at: photo.takenAt }) })),
      };
    }),
    p_cover_photo_id: draft.coverPhotoId,
    p_event_id: draft.eventLink?.eventId,
    p_event_date: draft.eventLink?.eventDate,
    p_tags: draft.tags,
  };
};

// 저장 시도에 쓰는 칸(판 번호 등), 사진 파일·미리보기 주소, 위치를 정한 곳은 사용자가 쓴 내용이 아니라 비교에서 뺀다
const toWrittenContent = ({ date, endDate, title, memo, groups, coverPhotoId, tags }: DateRecordDraft) => ({
  date,
  endDate,
  title,
  memo,
  groups: groups.map(({ id, location, placeName, caption, photos }) => ({ id, location, placeName, caption, photos: photos.map((photo) => photo.id) })),
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
 * `discarded`에서 첫 사진 정보를 읽는 중이던 모음에 위치가 채워지고 모음 순서가 바뀐 것 말고는 쓴 내용이 같은지 알려 준다.
 * 나가기를 고른 뒤 늦게 도착한 사진 정보는 사람이 계속 쓴 것이 아니므로, 숨겨질 때 그대로 버린다(#284, #249).
 *
 * @example isSameExceptReadingPhotoInfo(draftWhenDiscarded, draft) // true
 */
export const isSameExceptReadingPhotoInfo = <Photo extends DraftPhoto>(discarded: DateRecordDraft<Photo>, current: DateRecordDraft<Photo>): boolean => {
  const readingGroupIds = new Set(discarded.groups.filter(({ pendingLocationPhotoId }) => pendingLocationPhotoId).map(({ id }) => id));
  // 사진 정보가 도착하면 모음이 찍은 시각 자리로 옮겨지므로 순서는 견주지 않는다. 나가기를 고른 뒤에는 사람이 순서를 바꿀 수 없다
  const withoutReadingInfo = (draft: DateRecordDraft<Photo>): DateRecordDraft<Photo> => ({
    ...draft,
    groups: draft.groups
      .map((group) => (readingGroupIds.has(group.id) ? { ...group, location: undefined } : group))
      .toSorted((left, right) => left.id.localeCompare(right.id)),
  });
  return !hasRecordDraftChanges(withoutReadingInfo(discarded), withoutReadingInfo(current));
};
