"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffectEvent, useLayoutEffect, useRef, useState, type ReactElement, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { DateField, TextAreaField, TextField } from "@/components/FormField";
import { PageShell } from "@/components/PageShell";
import { ReloadLatestButton } from "@/components/ReloadLatestButton";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toKstDate } from "@/lib/anniversary";
import { RECORDS_PATH } from "@/lib/dates/album";
import {
  MEMO_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  addPhotos,
  addTag,
  getMinEndDate,
  hasRecordDraftChanges,
  isSameExceptReadingPhotoInfo,
  movePhoto,
  removePhoto,
  setPhotoLocation,
  validateDraft,
  type DateRecordDraft,
  type DraftErrors,
  type RecordPrefill,
} from "@/lib/dates/form";
import { focusFirstInvalidField } from "@/lib/focus-invalid-field";
import { clearError, countChars, FIX_FIELDS_NOTICE, isResolvedFieldNotice } from "@/lib/form";
import { subscribeToAppReturn } from "@/lib/navigation/app-return";
import { markAllScreensStale } from "@/lib/navigation/screen-freshness";
import { forgetScrollPosition } from "@/lib/navigation/scroll-memory";
import { BACK_TRANSITION, FORWARD_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import { useDiscardOnLeave } from "@/lib/navigation/use-discard-on-leave";
import { addMaybeSavedRevision } from "@/lib/revision";
import type { EditableRecord } from "@/lib/dates/detail";
import {
  DateRecordAlreadyLinkedError,
  DateRecordConflictError,
  DateRecordGoneError,
  SaveDateRecordError,
  saveDateRecord,
  updateDateRecord,
  type SaveProgress,
} from "@/lib/dates/save";
import { PhotoError } from "@/lib/photos/errors";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { readPhotoInfo } from "@/lib/photos/photo-info";
import { usePreviewUrls } from "@/lib/photos/preview-urls";
import { isAcceptedPhoto, resizePhoto } from "@/lib/photos/resize";
import { createClient } from "@/lib/supabase/client";
import { PhotoPicker, type PickedPhoto } from "./PhotoPicker";
import { TagField } from "./TagField";

const toProgressLabel = ({ step, done, total }: SaveProgress): string => {
  if (step === "resizing") return `사진 준비 중… ${done + 1}/${total}`;
  if (step === "uploading") return `사진 올리는 중… ${done}/${total}`;
  return "기록 저장 중…";
};

const toSaveErrorMessage = (error: unknown): string => {
  if (error instanceof PhotoError || error instanceof SaveDateRecordError) return error.message;
  return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
};

const createEmptyDraft = (prefill?: RecordPrefill): DateRecordDraft<PickedPhoto> => ({
  date: prefill?.date ?? toKstDate(new Date()),
  endDate: prefill?.endDate,
  title: prefill?.title ?? "",
  memo: prefill?.memo ?? "",
  eventLink: prefill?.eventLink,
  photos: [],
  coverPhotoId: undefined,
  tags: [],
});

const toEditDraft = ({ revision, date, endDate, title, memo, coverPhotoId, tags, photos }: EditableRecord): DateRecordDraft<PickedPhoto> => ({
  expectedRevisions: [revision],
  date,
  endDate,
  title,
  memo,
  coverPhotoId,
  tags,
  photos: photos.map((photo) => ({ ...photo, file: undefined, isReadingInfo: false })),
});

type RecordDraft = DateRecordDraft<PickedPhoto>;

const failedSaves = new Map<string, FailedSave<RecordDraft>>();

/** 예전 폼의 미리보기는 숨겨질 때 해제됐으므로 파일로 다시 만든다 */
const withNewPreviews = (draft: RecordDraft, createPreview: (file: File) => string): RecordDraft => ({
  ...draft,
  photos: draft.photos.map((photo) => (photo.file ? { ...photo, previewUrl: createPreview(photo.file) } : photo)),
});

interface DateRecordFormProps {
  /** 고칠 기록. 없으면 새 기록을 쓴다 */
  record?: EditableRecord;
  /** 새 기록에 미리 채울 값(지난 일정에서 넘어온 경우) */
  prefill?: RecordPrefill;
  /** 전에 쓴 태그 */
  tagSuggestions: string[];
}

/** 데이트 기록 작성·수정 폼. 새로 고른 사진을 줄여 올린 뒤 기록과 사진 행을 한 번에 저장한다. */
export const DateRecordForm = ({ record, prefill, tagSuggestions }: DateRecordFormProps): ReactElement => {
  const router = useRouter();
  // 지난 일정에서 넘어온 새 기록은 일정마다 다른 폼이다. 다른 일정의 실패한 내용이 채워지지 않게 값까지 구분한다
  const formKey = `record:${record ? record.id : `new:${prefill?.date ?? ""}:${prefill?.endDate ?? ""}:${prefill?.title ?? ""}:${prefill?.eventLink?.eventId ?? ""}`}`;
  const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey, subject: "기록을", failedSaves });
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
  const [isRecordGone, setIsRecordGone] = useState(false);
  // 일정에서 남기려는데 그 일정의 그날에 이미 남긴 기록이 있으면 그 기록 id(#227)
  const [linkedRecordId, setLinkedRecordId] = useState<string>();
  const [progress, setProgress] = useState<SaveProgress>();
  const [isSaving, setIsSaving] = useState(false);
  // 칸 오류를 모두 고치면 저장을 다시 누르기 전이라도 안내를 지운다. 효과로 지우면 한 번 더 그려지므로 그리는 중에 맞춘다
  if (isResolvedFieldNotice(notice, errors)) setNotice(undefined);
  const hasWrittenContent = hasRecordDraftChanges(initialDraft, draft) || tagInput.trim() !== "";
  // 저장하는 동안은 나가도 저장을 이어 가고 결과를 알린다(#104). 지워진 기록은 저장할 곳이 없어 묻지 않는다
  const shouldConfirmLeave = hasWrittenContent && !isSaving && !isRecordGone;
  const isReadingPhotoInfo = draft.photos.some(({ isReadingInfo }) => isReadingInfo);
  const today = toKstDate(new Date());
  const isPeriod = draft.endDate !== undefined;

  // 오늘을 기본값으로 연 새 기록 폼은 다시 보일 때 아무것도 쓰지 않았으면 날짜를 오늘로 맞춘다(#162).
  // 화면을 새로 받아도 같은 key라 처음 그린 날의 날짜가 남는다. 숨겨 둔 폼(Activity)은 다시 보일 때 효과가 다시 돌고,
  // 보고 있던 폼은 앱으로 돌아올 때 알림을 받는다. 그리기 전에 맞춰 어제 날짜가 잠깐 보이지 않게 한다
  const hasDefaultDate = !record && prefill?.date === undefined;
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
    setNotice(undefined);
    setLinkedRecordId(undefined);
    setProgress(undefined);
    setIsSaving(false);
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

  const handleAddPhotos = (files: File[]) => {
    const images = files.filter(isAcceptedPhoto);
    const picked = images.map((file) => ({
      id: crypto.randomUUID(),
      caption: "",
      location: undefined,
      file,
      previewUrl: previews.create(file),
      isReadingInfo: true,
    }));
    const result = addPhotos(draft, picked);
    const kept = picked.slice(0, picked.length - result.droppedCount);
    picked.slice(kept.length).forEach(({ previewUrl }) => previews.revoke(previewUrl));
    // 앞서 고른 사진의 정보가 아직 그려지기 전에 도착했을 수 있어, 그 값을 덮지 않게 최신 상태에 더한다.
    // 정보를 읽기 시작하는 `kept`만 더해, 읽지 않는 사진이 "읽는 중"으로 남아 저장을 막는 일이 없게 한다
    setDraft((current) => addPhotos(current, kept).draft);
    setErrors((current) => clearError(current, "photos"));
    kept.forEach(({ id, file }) => {
      // 줄이거나 HEIC를 바꾸면 사진 정보가 사라지므로 고른 원본에서 읽는다. readPhotoInfo는 실패해도 빈 값으로 끝난다
      void readPhotoInfo({ file }).then(({ location, takenAt }) => {
        setDraft((current) => ({
          ...current,
          photos: current.photos.map((photo) =>
            photo.id === id ? { ...photo, isReadingInfo: false, takenAt, location: photo.location ?? location } : photo,
          ),
        }));
      });
    });

    const skipped = files.length - images.length;
    const messages = [
      skipped > 0 && `JPEG·PNG·WebP·HEIC 사진만 올릴 수 있어 ${skipped}개는 뺐어요.`,
      result.droppedCount > 0 && `사진은 10장까지라 ${result.droppedCount}장은 뺐어요.`,
    ].filter(Boolean);
    // 다른 칸 오류가 남아 있으면 칸 오류 안내는 그대로 둔다
    setNotice((current) => (messages.length > 0 ? messages.join(" ") : current === FIX_FIELDS_NOTICE ? current : undefined));
  };

  const handleRemovePhoto = (photoId: string) => {
    const removed = draft.photos.find(({ id }) => id === photoId);
    if (removed) previews.revoke(removed.previewUrl);
    setDraft((current) => removePhoto(current, photoId));
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

    beginSave();
    setNotice(undefined);
    setIsSaving(true);
    try {
      const supabase = createClient();
      const storage = supabase.storage.from(ALBUM_BUCKET);
      const files = new Map(nextDraft.photos.flatMap(({ id, file }) => (file ? [[id, file] as const] : [])));
      let savedHref = record ? `/dates/${record.id}` : RECORDS_PATH;
      if (record) {
        await updateDateRecord({
          recordId,
          draft: nextDraft,
          files,
          storage,
          resize: resizePhoto,
          updateRecord: (args) => supabase.rpc("update_date_record", args),
          onProgress: setProgress,
        });
      } else {
        const result = await saveDateRecord({
          recordId,
          draft: nextDraft,
          files,
          storage,
          resize: resizePhoto,
          createRecord: (args) => supabase.rpc("create_date_record", args),
          onProgress: setProgress,
        });
        // 앞서 저장된 기록이 있어 이번 내용은 반영되지 않았으니, 저장된 내용을 바로 확인하게 한다
        if (result === "already-saved") savedHref = `/dates/${recordId}`;
      }
      // cacheComponents는 다녀온 화면을 Activity로 숨겨 상태를 보존한다. 다시 열었을 때 처음 상태가 되도록
      // 이동과 같은 transition에서 되돌린다(이동이 끝날 때 함께 반영돼 빈 폼이 잠깐 보이지 않는다)
      // 이미 그려진 미리보기는 URL을 해제해도 그대로 보인다. 수정 화면은 페이지가 매번 새 key로 다시 그린다
      draft.photos.forEach(({ previewUrl }) => previews.revoke(previewUrl));
      // 목록은 날짜 내림차순이라 새 기록은 맨 위에 있다. 보던 위치로 돌아가면 저장되지 않은 것처럼 보인다
      if (!record) forgetScrollPosition("records");
      finishSaved({ href: savedHref, reset: () => resetForm(record ? toEditDraft(record) : createEmptyDraft()) });
    } catch (error) {
      const message = toSaveErrorMessage(error);
      const isGone = error instanceof DateRecordGoneError;
      const hasConflict = error instanceof DateRecordConflictError;
      const mayHaveSaved = error instanceof SaveDateRecordError && error.mayHaveSaved;
      const failedFields = {
        hasConflict,
        uncertainSaveRecordId: mayHaveSaved ? recordId : nextDraft.uncertainSaveRecordId,
        expectedRevisions: addMaybeSavedRevision({ expectedRevisions: nextDraft.expectedRevisions, revision: nextDraft.nextRevision, mayHaveSaved }),
      };
      setDraft((current) => ({ ...current, ...failedFields }));
      // 저장됐거나 상대가 고쳤다면 숨겨 둔 목록·상세가 예전 내용을 보여 주므로, 돌아가면 새로 불러오게 한다
      if (mayHaveSaved || hasConflict) markAllScreensStale();
      setIsRecordGone(isGone);
      setLinkedRecordId(error instanceof DateRecordAlreadyLinkedError ? error.recordId : undefined);
      setNotice(message);
      setIsSaving(false);
      setProgress(undefined);
      finishFailed({ draft: { ...nextDraft, ...failedFields }, message, isGone });
    }
  };

  // 기록을 지웠을 때(DeleteRecordButton)와 같이 옮기면서 다시 불러온다
  const handleGoToRecords = () => {
    draft.photos.forEach(({ previewUrl }) => previews.revoke(previewUrl));
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
        <PhotoPicker
          photos={draft.photos}
          coverPhotoId={draft.coverPhotoId}
          errors={errors}
          isDisabled={isSaving}
          onAdd={handleAddPhotos}
          onRemove={handleRemovePhoto}
          // 사진 정보는 고른 뒤 따로 도착해 draft를 바꾼다. 그 값을 덮지 않게 사진 칸은 최신 상태에 맞춰 바꾼다
          onMove={(index, offset) => setDraft((current) => ({ ...current, photos: movePhoto(current.photos, index, offset) }))}
          onCaptionChange={(photoId, caption) => {
            setDraft((current) => ({
              ...current,
              photos: current.photos.map((photo) => (photo.id === photoId ? { ...photo, caption } : photo)),
            }));
            setErrors((current) => clearError(current, `caption:${photoId}`));
          }}
          onCoverChange={(photoId) => setDraft((current) => ({ ...current, coverPhotoId: photoId }))}
          onLocationChange={(photoId, location) =>
            setDraft((current) => ({ ...current, photos: setPhotoLocation(current.photos, photoId, location) }))
          }
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

        <div className="flex flex-col">
          {notice && (
            <p role="alert" className="mb-3 text-[13px] text-accent">
              {notice}
            </p>
          )}
          {isRecordGone ? (
            // 다시 저장해도 실패하고 사진만 또 올리게 되므로 저장 버튼 대신 나가는 길을 준다
            <button
              type="button"
              onClick={handleGoToRecords}
              className="press-wide h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background"
            >
              기록 목록으로
            </button>
          ) : linkedRecordId ? (
            // 다시 저장해도 거부되므로 저장 버튼 대신 남긴 기록으로 가는 길을 준다
            <Link
              href={`/dates/${linkedRecordId}`}
              transitionTypes={FORWARD_TRANSITION}
              className="press-wide flex h-[52px] w-full items-center justify-center rounded-[10px] bg-accent font-display text-[15px] text-background"
            >
              남긴 기록 보기
            </Link>
          ) : draft.hasConflict ? (
            <ReloadLatestButton />
          ) : (
            <button
              type="submit"
              disabled={isSaving || isReadingPhotoInfo}
              className="press-wide h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
            >
              {progress ? toProgressLabel(progress) : isSaving ? "저장 중…" : isReadingPhotoInfo ? "사진 정보 읽는 중…" : "저장"}
            </button>
          )}
          <p aria-live="polite" className="sr-only">
            {progress ? toProgressLabel(progress) : ""}
          </p>
        </div>
      </form>
    </PageShell>
  );
};
