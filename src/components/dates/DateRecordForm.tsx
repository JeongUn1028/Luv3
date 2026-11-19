"use client";

import { useRouter } from "next/navigation";
import { startTransition, useState, type ReactElement, type SubmitEvent } from "react";
import { TextField } from "@/components/FormField";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toKstDate } from "@/lib/anniversary";
import { RECORDS_PATH } from "@/lib/dates/album";
import { hasRecordDraftChanges, isSameExceptReadingPhotoInfo } from "@/lib/dates/draft-changes";
import { TITLE_MAX_LENGTH, validateDraft, type DraftErrors, type RecordPrefill } from "@/lib/dates/form";
import { getDraftPhotos } from "@/lib/dates/photo-group-draft";
import { toRecordHref } from "@/lib/dates/record-href";
import { addTag } from "@/lib/dates/tags";
import { showInvalidFields } from "@/lib/focus-invalid-field";
import { clearError, clearFieldError, isResolvedFieldNotice, toPeriodEndDate } from "@/lib/form";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { useDiscardOnLeave } from "@/lib/navigation/use-discard-on-leave";
import type { EditableRecord } from "@/lib/dates/editable-record";
import { usePreviewUrls } from "@/lib/photos/preview-urls";
import { PhotoGroupsField } from "./PhotoGroupsField";
import { createEmptyRecordDraft, toEditRecordDraft, withNewPreviews, type RecordDraft } from "./record-form/record-draft";
import { RecordDateFields } from "./record-form/RecordDateFields";
import { RecordFormFooter } from "./record-form/RecordFormFooter";
import { RecordMemoField } from "./record-form/RecordMemoField";
import { usePhotoGroupEditing } from "./record-form/use-photo-group-editing";
import { useRecordSave } from "./record-form/use-record-save";
import { useRecordTags } from "./record-form/use-record-tags";
import { useUntouchedDateToday } from "./record-form/use-untouched-date-today";
import { TagField } from "./TagField";

const failedSaves = new Map<string, FailedSave<RecordDraft>>();

interface DateRecordFormProps {
  /** 고칠 기록. 없으면 새 기록을 쓴다 */
  record?: EditableRecord;
  /** 새 기록에 미리 채울 값(지난 일정에서 넘어온 경우) */
  prefill?: RecordPrefill;
  /** 전에 쓴 태그 */
  tagSuggestions: string[];
  /** 지도 키. 모음 위치를 지도에서 고를 때 쓴다 */
  mapKey: string | undefined;
}

/** 데이트 기록 작성·수정 폼. 새로 고른 사진을 줄여 올린 뒤 기록과 사진 행을 한 번에 저장한다. */
export const DateRecordForm = ({ record, prefill, tagSuggestions, mapKey }: DateRecordFormProps): ReactElement => {
  const router = useRouter();
  // 지난 일정에서 넘어온 새 기록은 일정마다 다른 폼이다. 다른 일정의 실패한 내용이 채워지지 않게 값까지 구분한다
  const formKey = `record:${record ? record.id : `new:${prefill?.date ?? ""}:${prefill?.endDate ?? ""}:${prefill?.title ?? ""}:${prefill?.eventLink.eventId ?? ""}`}`;
  const { failedSave, ...leavableSave } = useLeavableSave({ formKey, subject: "기록을", failedSaves });
  // 쓴 내용이 있는지 견줄 처음 내용. 실패해서 다시 채운 내용도 아직 저장되지 않았으므로 이것과 견준다
  const [initialDraft, setInitialDraft] = useState(() => (record ? toEditRecordDraft(record) : createEmptyRecordDraft(prefill)));
  // 미리보기는 모두 여기서 만들어, 화면을 떠날 때 빠짐없이 해제한다
  const previews = usePreviewUrls();
  const [draft, setDraft] = useState(() => (failedSave ? withNewPreviews(failedSave.draft, previews.create) : initialDraft));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [notice, setNotice] = useState(failedSave?.message);
  const recordTags = useRecordTags({ draft, setDraft, setErrors });
  const { tagInput, setTagInput, isTagFieldOpen } = recordTags;
  const photoGroups = usePhotoGroupEditing({ draft, setDraft, setErrors, setNotice, previews });
  const recordSave = useRecordSave({ record, setDraft, setNotice, previews, leavableSave });
  const { isSaving, isRecordGone } = recordSave;
  // 칸 오류를 모두 고치면 저장을 다시 누르기 전이라도 안내를 지운다. 효과로 지우면 한 번 더 그려지므로 그리는 중에 맞춘다
  if (isResolvedFieldNotice(notice, errors)) setNotice(undefined);
  const hasWrittenContent = hasRecordDraftChanges(initialDraft, draft) || tagInput.trim() !== "";
  // 저장하는 동안은 나가도 저장을 이어 가고 결과를 알린다(#104). 지워진 기록은 저장할 곳이 없어 묻지 않는다
  const shouldConfirmLeave = hasWrittenContent && !isSaving && !isRecordGone;
  const isReadingPhotoInfo = getDraftPhotos(draft.groups).some(({ isReadingInfo }) => isReadingInfo);
  const today = toKstDate(new Date());

  useUntouchedDateToday({ isEnabled: !record && !prefill, hasWrittenContent, date: draft.date, setInitialDraft, setDraft });

  /** 폼을 `nextDraft`로 처음부터 다시 쓰는 상태로 되돌린다. 저장한 뒤와 쓴 내용을 버리고 나갈 때 쓴다 */
  const resetForm = (nextDraft: RecordDraft) => {
    setInitialDraft(nextDraft);
    setDraft(nextDraft);
    recordTags.resetTags(nextDraft.tags);
    setErrors({});
    photoGroups.resetEditingState();
    setNotice(undefined);
    recordSave.resetSaveState();
  };

  // 새 기록 폼은 다시 열면 숨겨 둔 폼을 그대로 보여 주므로, 경고 창에서 버리기로 했으면 숨겨질 때 처음 내용으로 되돌린다(#284).
  // 고친 기록 폼은 열 때마다 새로 만들어져 되돌릴 필요가 없다. 미리보기는 숨겨질 때 usePreviewUrls가 해제한다
  // 나가기를 고른 뒤 숨겨지기 전에 사진 정보가 도착해도 버린다
  const discardOnLeave = useDiscardOnLeave({
    content: draft,
    reset: () => resetForm(createEmptyRecordDraft(prefill)),
    isSameContent: isSameExceptReadingPhotoInfo,
  });

  const updateField = (field: "date" | "endDate" | "title" | "memo", value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearFieldError(current, field));
  };

  const handlePeriodChange = (isChecked: boolean) => {
    setDraft((current) => ({ ...current, endDate: toPeriodEndDate(isChecked) }));
    setErrors((current) => clearError(current, "endDate"));
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    // 사진 정보를 읽는 중에 저장하면 그 사진의 위치·찍은 시각이 빠진다. 찍은 시각은 나중에 되살릴 수 없다
    if (isSaving || isReadingPhotoInfo) return;
    const form = event.currentTarget;

    // 적어 두고 추가를 누르지 않은 태그를 잃지 않게 함께 저장한다
    const { tags, error: tagError } = addTag(draft.tags, tagInput);
    // 시도마다 새 판 번호를 쓴다. 내용이 바뀌면 판 번호도 바뀌어야 열어 둔 상대의 화면이 알아챈다
    const nextDraft = { ...draft, tags, ...(record && { nextRevision: crypto.randomUUID() }) };
    setDraft(nextDraft);
    if (!tagError) setTagInput("");

    const nextErrors: DraftErrors = { ...validateDraft(nextDraft, today), ...(tagError && { tags: tagError }) };
    if (showInvalidFields({ form, errors: nextErrors, setErrors, setNotice })) return;

    const recordId = record?.id ?? nextDraft.uncertainSaveRecordId ?? crypto.randomUUID();
    await recordSave.save({ draft: nextDraft, recordId, reset: () => resetForm(record ? toEditRecordDraft(record) : createEmptyRecordDraft()) });
  };

  // 기록을 지웠을 때(DeleteRecordButton)와 같이 옮기면서 다시 불러온다
  const handleGoToRecords = () => {
    getDraftPhotos(draft.groups).forEach(({ previewUrl }) => previews.revoke(previewUrl));
    startTransition(() => {
      router.replace(RECORDS_PATH, { transitionTypes: BACK_TRANSITION });
      router.refresh();
    });
  };

  return (
    <PageShell
      bottomSpace="sm"
      className="px-4"
      header={
        <ScreenHeader
          // 지워진 기록의 상세는 찾을 수 없음 화면이라 기록을 되돌아가지 않고 목록으로 간다
          back={
            record && !isRecordGone
              ? { href: toRecordHref(record.id), shouldConfirmLeave }
              : { href: RECORDS_PATH, skipsHistory: isRecordGone, shouldConfirmLeave, onConfirmLeave: record ? undefined : discardOnLeave }
          }
          title={record ? "기록 고치기" : "기록 남기기"}
        />
      }
    >
      {/* 폼을 화면 남은 높이까지 늘리고 정리 글 칸이 그 여유를 채운다. 칸을 고정 줄 수로 두면 기기 높이에 따라 조금씩 넘쳐 스크롤이 생긴다(#52) */}
      <form onSubmit={handleSubmit} noValidate className="mt-3 flex flex-1 flex-col gap-4">
        <PhotoGroupsField
          groups={draft.groups}
          coverPhotoId={draft.coverPhotoId}
          selectedPhotoId={photoGroups.selectedPhotoId}
          errors={errors}
          isDisabled={isSaving}
          mapKey={mapKey}
          onAddGroup={photoGroups.handleAddGroup}
          onLocationChange={photoGroups.handleLocationChange}
          actions={photoGroups.actions}
        />

        <RecordDateFields
          date={draft.date}
          endDate={draft.endDate}
          today={today}
          errors={errors}
          isDisabled={isSaving}
          onDateChange={updateField}
          onPeriodChange={handlePeriodChange}
        />

        <TextField
          id="title"
          label="제목"
          value={draft.title}
          placeholder="어떤 데이트였나요?"
          maxLength={TITLE_MAX_LENGTH * 2}
          disabled={isSaving}
          error={errors.title}
          // 태그 칸은 눌러야 열린다. 여는 버튼은 바로 아래 칸이 생기는 제목 줄에 둔다
          aside={
            !isTagFieldOpen && (
              <button
                type="button"
                disabled={isSaving}
                onClick={recordTags.handleOpenTagField}
                // 글자 줄만큼만 차지하면서 44px을 누를 수 있게 넓힌다. 아래 입력 칸의 오른쪽 위 끝이 조금 겹치므로 칸보다 위에 둔다
                className="press-icon relative z-10 text-[13px] leading-[19px] text-ink-sub after:absolute after:-inset-y-[12.5px] after:inset-x-0 disabled:opacity-50"
              >
                태그 추가
              </button>
            )
          }
          onChange={(value) => updateField("title", value)}
        />

        {isTagFieldOpen && (
          <TagField
            inputRef={recordTags.tagInputRef}
            tags={draft.tags}
            suggestions={tagSuggestions}
            input={tagInput}
            error={errors.tags}
            isDisabled={isSaving}
            onInputChange={recordTags.handleTagInputChange}
            onAdd={recordTags.handleAddTag}
            onRemove={recordTags.handleRemoveTag}
          />
        )}

        <RecordMemoField value={draft.memo} error={errors.memo} isDisabled={isSaving} onChange={(value) => updateField("memo", value)} />

        <RecordFormFooter
          notice={notice}
          isRecordGone={isRecordGone}
          linkedRecordId={draft.alreadyLinkedRecordId}
          hasConflict={draft.hasConflict}
          isSaving={isSaving}
          isReadingPhotoInfo={isReadingPhotoInfo}
          progress={recordSave.progress}
          onGoToRecords={handleGoToRecords}
        />
      </form>
    </PageShell>
  );
};
