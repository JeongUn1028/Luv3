"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffectEvent, useLayoutEffect, useRef, useState, type ReactElement, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { DateField, TextAreaField, TextField } from "@/components/FormField";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toKstDate } from "@/lib/anniversary";
import { RECORDS_PATH } from "@/lib/dates/album";
import {
  MEMO_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  addTag,
  getMinEndDate,
  hasRecordDraftChanges,
  isSameExceptReadingPhotoInfo,
  validateDraft,
  type DateRecordDraft,
  type DraftErrors,
  type RecordPrefill,
} from "@/lib/dates/form";
import { getDraftPhotos } from "@/lib/dates/photo-group-draft";
import { focusFirstInvalidField } from "@/lib/focus-invalid-field";
import { clearError, countChars, FIX_FIELDS_NOTICE, isResolvedFieldNotice } from "@/lib/form";
import { subscribeToAppReturn } from "@/lib/navigation/app-return";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { useDiscardOnLeave } from "@/lib/navigation/use-discard-on-leave";
import type { EditableRecord } from "@/lib/dates/detail";
import { usePreviewUrls } from "@/lib/photos/preview-urls";
import type { PickedPhoto } from "./PhotoGroupCard";
import { PhotoGroupsField } from "./PhotoGroupsField";
import { RecordFormFooter } from "./record-form/RecordFormFooter";
import { usePhotoGroupEditing } from "./record-form/use-photo-group-editing";
import { useRecordSave } from "./record-form/use-record-save";
import { TagField } from "./TagField";

const createEmptyDraft = (prefill?: RecordPrefill): DateRecordDraft<PickedPhoto> => ({
  date: prefill?.date ?? toKstDate(new Date()),
  endDate: prefill?.endDate,
  title: prefill?.title ?? "",
  memo: prefill?.memo ?? "",
  eventLink: prefill?.eventLink,
  groups: [],
  coverPhotoId: undefined,
  tags: [],
});

const toEditDraft = ({ revision, date, endDate, title, memo, coverPhotoId, tags, groups }: EditableRecord): DateRecordDraft<PickedPhoto> => ({
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

type RecordDraft = DateRecordDraft<PickedPhoto>;

const failedSaves = new Map<string, FailedSave<RecordDraft>>();

/** 예전 폼의 미리보기는 숨겨질 때 해제됐으므로 파일로 다시 만든다 */
const withNewPreviews = (draft: RecordDraft, createPreview: (file: File) => string): RecordDraft => ({
  ...draft,
  groups: draft.groups.map((group) => ({
    ...group,
    photos: group.photos.map((photo) => (photo.file ? { ...photo, previewUrl: createPreview(photo.file) } : photo)),
  })),
});

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
  const [initialDraft, setInitialDraft] = useState(() => (record ? toEditDraft(record) : createEmptyDraft(prefill)));
  // 미리보기는 모두 여기서 만들어, 화면을 떠날 때 빠짐없이 해제한다
  const previews = usePreviewUrls();
  const [draft, setDraft] = useState(() => (failedSave ? withNewPreviews(failedSave.draft, previews.create) : initialDraft));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [tagInput, setTagInput] = useState("");
  // 칸을 늘 열어 두면 빈 작성 화면에 스크롤이 생긴다(#52). 태그가 있는 기록은 열어 둔다
  const [isTagFieldOpen, setIsTagFieldOpen] = useState(draft.tags.length > 0);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState(failedSave?.message);
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
  const isPeriod = draft.endDate !== undefined;

  // 오늘을 기본값으로 연 새 기록 폼은 다시 보일 때 아무것도 쓰지 않았으면 날짜를 오늘로 맞춘다(#162).
  // 화면을 새로 받아도 같은 key라 처음 그린 날의 날짜가 남는다. 숨겨 둔 폼(Activity)은 다시 보일 때 효과가 다시 돌고,
  // 보고 있던 폼은 앱으로 돌아올 때 알림을 받는다. 그리기 전에 맞춰 어제 날짜가 잠깐 보이지 않게 한다
  const hasDefaultDate = !record && !prefill;
  const moveUntouchedDateToToday = useEffectEvent(() => {
    const currentToday = toKstDate(new Date());
    // 날짜를 직접 고친 것도 쓴 내용이라 그대로 둔다
    if (hasWrittenContent || draft.date >= currentToday) return;
    setInitialDraft((current) => ({ ...current, date: currentToday }));
    setDraft((current) => ({ ...current, date: currentToday }));
  });
  useLayoutEffect(() => {
    if (!hasDefaultDate) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 다시 보일 때 바깥 시계에 맞춘다. 날짜가 지났을 때만 바꿔 연달아 그리지 않는다
    moveUntouchedDateToToday();
    return subscribeToAppReturn(moveUntouchedDateToToday);
  }, [hasDefaultDate]);

  /** 폼을 `nextDraft`로 처음부터 다시 쓰는 상태로 되돌린다. 저장한 뒤와 쓴 내용을 버리고 나갈 때 쓴다 */
  const resetForm = (nextDraft: RecordDraft) => {
    setInitialDraft(nextDraft);
    setDraft(nextDraft);
    setTagInput("");
    setIsTagFieldOpen(nextDraft.tags.length > 0);
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
    reset: () => resetForm(createEmptyDraft(prefill)),
    isSameContent: isSameExceptReadingPhotoInfo,
  });

  const updateField = (field: "date" | "endDate" | "title" | "memo", value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => {
      const cleared = clearError(current, field);
      // 끝 날짜 에러는 시작 날짜에 따라 달라지므로, 시작 날짜를 고치면 함께 지우고 저장할 때 다시 확인한다
      return field === "date" ? clearError(cleared, "endDate") : cleared;
    });
  };

  const handlePeriodChange = (isChecked: boolean) => {
    setDraft((current) => ({ ...current, endDate: isChecked ? "" : undefined }));
    setErrors((current) => clearError(current, "endDate"));
  };

  const handleOpenTagField = () => {
    // iOS는 누르는 동작 안에서 초점을 줘야 키보드를 연다. 칸을 먼저 그려야 초점을 줄 수 있다
    flushSync(() => setIsTagFieldOpen(true));
    tagInputRef.current?.focus();
  };

  const handleAddTag = (text: string) => {
    const { tags, error } = addTag(draft.tags, text);
    setDraft((current) => ({ ...current, tags }));
    setErrors((current) => (error ? { ...current, tags: error } : clearError(current, "tags")));
    // 전에 쓴 태그를 눌렀을 때는 적던 글자를 그대로 둔다
    if (!error && text === tagInput) setTagInput("");
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
    if (Object.keys(nextErrors).length > 0) {
      // 오류 칸이 그려져야 찾을 수 있어 바로 그린다
      flushSync(() => {
        setErrors(nextErrors);
        setNotice(FIX_FIELDS_NOTICE);
      });
      focusFirstInvalidField(form);
      return;
    }
    setErrors(nextErrors);

    const recordId = record?.id ?? nextDraft.uncertainSaveRecordId ?? crypto.randomUUID();
    await recordSave.save({ draft: nextDraft, recordId, reset: () => resetForm(record ? toEditDraft(record) : createEmptyDraft()) });
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
              ? { href: `/dates/${record.id}`, shouldConfirmLeave }
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

        <div className="flex flex-col">
          <DateField
            id="date"
            label={isPeriod ? "시작 날짜" : "날짜"}
            max={today}
            value={draft.date}
            isDisabled={isSaving}
            error={errors.date}
            onChange={(date) => updateField("date", date)}
          />
          <label className="mt-1 flex h-11 w-fit items-center gap-2 text-[13px] text-ink-sub">
            <input
              type="checkbox"
              checked={isPeriod}
              disabled={isSaving}
              onChange={(event) => handlePeriodChange(event.target.checked)}
              className="size-4 accent-accent"
            />
            기간으로 남기기
          </label>
          {isPeriod && (
            <DateField
              id="endDate"
              label="끝 날짜"
              min={getMinEndDate(draft.date, today)}
              max={today}
              value={draft.endDate ?? ""}
              openDate={draft.date}
              isDisabled={isSaving}
              error={errors.endDate}
              onChange={(date) => updateField("endDate", date)}
              className="mt-2"
            />
          )}
        </div>

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
                onClick={handleOpenTagField}
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
            inputRef={tagInputRef}
            tags={draft.tags}
            suggestions={tagSuggestions}
            input={tagInput}
            error={errors.tags}
            isDisabled={isSaving}
            onInputChange={(value) => {
              setTagInput(value);
              setErrors((current) => clearError(current, "tags"));
            }}
            onAdd={handleAddTag}
            onRemove={(tag) => {
              setDraft((current) => ({ ...current, tags: current.tags.filter((existing) => existing !== tag) }));
              setErrors((current) => clearError(current, "tags"));
            }}
          />
        )}

        <TextAreaField
          id="memo"
          label="정리 글"
          hint="선택"
          aside={
            <span id="memo-count" className="font-display text-[12px] tracking-[1px] text-ink-sub">
              {countChars(draft.memo.trim()).toLocaleString()}/{MEMO_MAX_LENGTH.toLocaleString()}
            </span>
          }
          describedBy="memo-count"
          value={draft.memo}
          // 최소 4줄. 남은 공간은 grow로 채우고, 사진·오류 문구로 내용이 길어지면 4줄을 남기고 페이지가 스크롤된다
          rows={4}
          placeholder="오늘 하루를 길게 남겨 두세요"
          disabled={isSaving}
          error={errors.memo}
          onChange={(value) => updateField("memo", value)}
          className="grow"
        />

        <RecordFormFooter
          notice={notice}
          isRecordGone={isRecordGone}
          linkedRecordId={recordSave.linkedRecordId}
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
