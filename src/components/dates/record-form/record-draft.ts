import { toKstDate } from "@/lib/anniversary";
import type { EditableRecord } from "@/lib/dates/editable-record";
import type { DateRecordDraft, RecordPrefill } from "@/lib/dates/form";
import type { PickedPhoto } from "../PhotoGroupCard";

/** 기록 폼의 입력값. 사진은 새로 고른 파일과 미리보기 주소를 함께 든다 */
export type RecordDraft = DateRecordDraft<PickedPhoto>;

/**
 * 새 기록 폼의 처음 내용. 지난 일정에서 넘어왔으면 그 일정의 날짜·제목·메모와 이을 일정을 채우고, 아니면 한국 날짜로 오늘이다.
 *
 * @example createEmptyRecordDraft() // { date: "2026-11-16", title: "", groups: [], ... }
 */
export const createEmptyRecordDraft = (prefill?: RecordPrefill): RecordDraft => ({
  date: prefill?.date ?? toKstDate(new Date()),
  endDate: prefill?.endDate,
  title: prefill?.title ?? "",
  memo: prefill?.memo ?? "",
  eventLink: prefill?.eventLink,
  groups: [],
  coverPhotoId: undefined,
  tags: [],
});

/**
 * 저장된 기록을 고치기 폼의 처음 내용으로 바꾼다. 저장된 사진은 새 파일이 없고, 불러온 판 번호로만 저장할 수 있다.
 *
 * @example toEditRecordDraft(record).expectedRevisions // [record.revision]
 */
export const toEditRecordDraft = ({ revision, date, endDate, title, memo, coverPhotoId, tags, groups }: EditableRecord): RecordDraft => ({
  expectedRevisions: [revision],
  date,
  endDate,
  title,
  memo,
  coverPhotoId,
  tags,
  groups: groups.map(({ id, location, placeName, caption, photos }) => ({
    id,
    location,
    locationSource: "saved",
    pendingLocationPhotoId: undefined,
    placeName,
    caption,
    photos: photos.map((photo) => ({ ...photo, file: undefined, isReadingInfo: false })),
  })),
});

/**
 * 예전 폼의 미리보기는 숨겨질 때 해제됐으므로, 저장에 실패해 다시 채운 내용의 새 사진은 파일로 미리보기를 다시 만든다.
 *
 * @example withNewPreviews(failedSave.draft, previews.create)
 */
export const withNewPreviews = (draft: RecordDraft, createPreview: (file: File) => string): RecordDraft => ({
  ...draft,
  groups: draft.groups.map((group) => ({
    ...group,
    photos: group.photos.map((photo) => (photo.file ? { ...photo, previewUrl: createPreview(photo.file) } : photo)),
  })),
});
