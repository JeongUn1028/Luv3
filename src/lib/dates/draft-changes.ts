import { isSameFormValue } from "@/lib/form";
import type { DateRecordDraft, DraftPhoto } from "./form";

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
