"use client";

import { useRouter } from "next/navigation";
import { startTransition, useTransition, useEffect, useRef, useState, type ReactElement, type SubmitEvent } from "react";
import { flushSync } from "react-dom";
import { DatePickerField } from "@/components/DatePickerField";
import { PageShell } from "@/components/PageShell";
import { ScreenHeader } from "@/components/ScreenHeader";
import { toKstDate } from "@/lib/anniversary";
import { RECORDS_PATH } from "@/lib/dates/album";
import {
  MEMO_MAX_LENGTH,
  PLACE_MAX_LENGTH,
  takeChars,
  TITLE_MAX_LENGTH,
  addPhotos,
  addTag,
  getMinEndDate,
  movePhoto,
  removePhoto,
  validateDraft,
  type DateRecordDraft,
  type DraftErrors,
  type RecordPrefill,
} from "@/lib/dates/form";
import { clearError, countChars } from "@/lib/form";
import { markAllScreensStale } from "@/lib/navigation/screen-freshness";
import { forgetScrollPosition } from "@/lib/navigation/scroll-memory";
import { BACK_TRANSITION } from "@/lib/navigation/transition";
import { useLeavableSave, type FailedSave } from "@/lib/navigation/use-leavable-save";
import type { EditableRecord } from "@/lib/dates/detail";
import { DateRecordConflictError, DateRecordGoneError, SaveDateRecordError, saveDateRecord, updateDateRecord, type SaveProgress } from "@/lib/dates/save";
import { PhotoError } from "@/lib/photos/errors";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { isAcceptedPhoto, resizePhoto } from "@/lib/photos/resize";
import { createClient } from "@/lib/supabase/client";
import { PhotoPicker, type PickedPhoto } from "./PhotoPicker";
import { PlaceField } from "@/components/dates/PlaceField";
import { TagField } from "./TagField";

const labelClassName = "text-[13px] text-ink-sub";
const inputClassName =
  "mt-2 h-[51px] w-full rounded-[10px] border border-line bg-surface px-4 text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent";
const errorClassName = "mt-2 text-[12px] text-accent";

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
  endDate: undefined,
  title: prefill?.title ?? "",
  place: prefill?.place ?? "",
  memo: "",
  photos: [],
  coverPhotoId: undefined,
  tags: [],
  location: undefined,
});

const toEditDraft = ({ revision, date, endDate, title, place, memo, coverPhotoId, tags, location, photos }: EditableRecord): DateRecordDraft<PickedPhoto> => ({
  expectedRevisions: [revision],
  date,
  endDate,
  title,
  place,
  memo,
  coverPhotoId,
  tags,
  location,
  photos: photos.map((photo) => ({ ...photo, file: undefined })),
});

type RecordDraft = DateRecordDraft<PickedPhoto>;

const failedSaves = new Map<string, FailedSave<RecordDraft>>();

/** 예전 폼의 미리보기는 숨겨질 때 해제됐으므로 파일로 다시 만든다 */
const withNewPreviews = (draft: RecordDraft): RecordDraft => ({
  ...draft,
  photos: draft.photos.map((photo) => (photo.file ? { ...photo, previewUrl: URL.createObjectURL(photo.file) } : photo)),
});

interface DateRecordFormProps {
  /** 고칠 기록. 없으면 새 기록을 쓴다 */
  record?: EditableRecord;
  /** 새 기록에 미리 채울 값(지난 일정에서 넘어온 경우) */
  prefill?: RecordPrefill;
  /** 전에 쓴 태그 */
  tagSuggestions: string[];
  /** 장소 찾기를 쓸 수 있는지(서버에 키가 있는지) */
  canSearchPlace: boolean;
}

/** 데이트 기록 작성·수정 폼. 새로 고른 사진을 줄여 올린 뒤 기록과 사진 행을 한 번에 저장한다. */
export const DateRecordForm = ({ record, prefill, tagSuggestions, canSearchPlace }: DateRecordFormProps): ReactElement => {
  const router = useRouter();
  // 지난 일정에서 넘어온 새 기록은 일정마다 다른 폼이다. 다른 일정의 실패한 내용이 채워지지 않게 값까지 구분한다
  const formKey = `record:${record ? record.id : `new:${prefill?.date ?? ""}:${prefill?.title ?? ""}:${prefill?.place ?? ""}`}`;
  const { failedSave, beginSave, finishSaved, finishFailed } = useLeavableSave({ formKey, subject: "기록을", failedSaves });
  const [draft, setDraft] = useState(() => {
    if (failedSave) return withNewPreviews(failedSave.draft);
    return record ? toEditDraft(record) : createEmptyDraft(prefill);
  });
  const [isReloading, startReloading] = useTransition();
  const [errors, setErrors] = useState<DraftErrors>({});
  const [tagInput, setTagInput] = useState("");
  // 찾기 결과는 PlaceField 안에 있어, 저장 뒤 숨겨진 폼을 되돌릴 때 key를 바꿔 함께 비운다
  const [placeFieldKey, setPlaceFieldKey] = useState(0);
  // 칸을 늘 열어 두면 빈 작성 화면에 스크롤이 생긴다(#52). 태그가 있는 기록은 열어 둔다
  const [isTagFieldOpen, setIsTagFieldOpen] = useState(draft.tags.length > 0);
  const tagInputRef = useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState(failedSave?.message);
  const [isRecordGone, setIsRecordGone] = useState(false);
  const [progress, setProgress] = useState<SaveProgress>();
  const [isSaving, setIsSaving] = useState(false);
  const today = toKstDate(new Date());
  const isPeriod = draft.endDate !== undefined;

  // 만든 미리보기 URL. 사진을 빼거나 화면을 떠날 때 해제한다(브라우저 메모리 = 외부 자원)
  const previewUrlsRef = useRef(new Set(draft.photos.flatMap(({ file, previewUrl }) => (file && previewUrl ? [previewUrl] : []))));
  useEffect(() => {
    const previewUrls = previewUrlsRef.current;
    return () => previewUrls.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  // 이미 저장된 사진의 미리보기(서명 URL)는 만든 적이 없으므로 건드리지 않는다
  const revokePreview = (url: string | undefined) => {
    if (!url || !previewUrlsRef.current.has(url)) return;
    URL.revokeObjectURL(url);
    previewUrlsRef.current.delete(url);
  };

  const updatePlace = (changes: Partial<Pick<RecordDraft, "place" | "location">>) => {
    setDraft((current) => ({ ...current, ...changes }));
    setErrors((current) => clearError(current, "place"));
  };

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
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    picked.forEach(({ previewUrl }) => previewUrlsRef.current.add(previewUrl));
    const result = addPhotos(draft, picked);
    picked.slice(picked.length - result.droppedCount).forEach(({ previewUrl }) => revokePreview(previewUrl));
    setDraft(result.draft);
    setErrors((current) => clearError(current, "photos"));

    const skipped = files.length - images.length;
    const messages = [
      skipped > 0 && `JPEG·PNG·WebP·HEIC 사진만 올릴 수 있어 ${skipped}개는 뺐어요.`,
      result.droppedCount > 0 && `사진은 10장까지라 ${result.droppedCount}장은 뺐어요.`,
    ].filter(Boolean);
    setNotice(messages.length > 0 ? messages.join(" ") : undefined);
  };

  const handleRemovePhoto = (photoId: string) => {
    const removed = draft.photos.find(({ id }) => id === photoId);
    if (removed) revokePreview(removed.previewUrl);
    setDraft(removePhoto(draft, photoId));
  };

  const handleOpenTagField = () => {
    // iOS는 누르는 동작 안에서 초점을 줘야 키보드를 연다. 칸을 먼저 그려야 초점을 줄 수 있다
    flushSync(() => setIsTagFieldOpen(true));
    tagInputRef.current?.focus();
  };

  const handleAddTag = (text: string) => {
    const { tags, error } = addTag(draft.tags, text);
    setDraft({ ...draft, tags });
    setErrors((current) => (error ? { ...current, tags: error } : clearError(current, "tags")));
    // 전에 쓴 태그를 눌렀을 때는 적던 글자를 그대로 둔다
    if (!error && text === tagInput) setTagInput("");
  };

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    // 적어 두고 추가를 누르지 않은 태그를 잃지 않게 함께 저장한다
    const { tags, error: tagError } = addTag(draft.tags, tagInput);
    // 시도마다 새 판 번호를 쓴다. 내용이 바뀌면 판 번호도 바뀌어야 열어 둔 상대의 화면이 알아챈다
    const nextDraft = { ...draft, tags, ...(record && { nextRevision: crypto.randomUUID() }) };
    setDraft(nextDraft);
    if (!tagError) setTagInput("");

    const nextErrors: DraftErrors = { ...validateDraft(nextDraft, today), ...(tagError && { tags: tagError }) };
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice("입력한 내용을 확인해 주세요.");
      return;
    }

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
      draft.photos.forEach(({ previewUrl }) => revokePreview(previewUrl));
      // 목록은 날짜 내림차순이라 새 기록은 맨 위에 있다. 보던 위치로 돌아가면 저장되지 않은 것처럼 보인다
      if (!record) forgetScrollPosition("records");
      finishSaved({
        href: savedHref,
        reset: () => {
          setDraft(record ? toEditDraft(record) : createEmptyDraft());
          setTagInput("");
          setPlaceFieldKey((key) => key + 1);
          setIsTagFieldOpen(Boolean(record?.tags.length));
          setErrors({});
          setNotice(undefined);
          setProgress(undefined);
          setIsSaving(false);
        },
      });
    } catch (error) {
      const message = toSaveErrorMessage(error);
      const isGone = error instanceof DateRecordGoneError;
      const hasConflict = error instanceof DateRecordConflictError;
      const mayHaveSaved = error instanceof SaveDateRecordError && error.mayHaveSaved;
      const failedFields = {
        hasConflict,
        uncertainSaveRecordId: mayHaveSaved ? recordId : nextDraft.uncertainSaveRecordId,
        // 저장됐을 수 있는 내 판은 다음 시도에서 상대의 저장으로 오해하지 않게 허용한다
        expectedRevisions: mayHaveSaved && nextDraft.nextRevision ? [...(nextDraft.expectedRevisions ?? []), nextDraft.nextRevision] : nextDraft.expectedRevisions,
      };
      setDraft((current) => ({ ...current, ...failedFields }));
      // 저장됐거나 상대가 고쳤다면 숨겨 둔 목록·상세가 예전 내용을 보여 주므로, 돌아가면 새로 불러오게 한다
      if (mayHaveSaved || hasConflict) markAllScreensStale();
      setIsRecordGone(isGone);
      setNotice(message);
      setIsSaving(false);
      setProgress(undefined);
      finishFailed({ draft: { ...nextDraft, ...failedFields }, message, isGone });
    }
  };

  // 페이지가 다시 불러올 때마다 폼을 새로 만들므로, 최신 기록으로 다시 고칠 수 있다
  const handleReloadLatest = () => {
    startReloading(() => {
      router.refresh();
    });
  };

  // 기록을 지웠을 때(DeleteRecordButton)와 같이 옮기면서 다시 불러온다
  const handleGoToRecords = () => {
    draft.photos.forEach(({ previewUrl }) => revokePreview(previewUrl));
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
          back={record && !isRecordGone ? { href: `/dates/${record.id}` } : { href: RECORDS_PATH, skipsHistory: isRecordGone }}
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
          onMove={(index, offset) => setDraft({ ...draft, photos: movePhoto(draft.photos, index, offset) })}
          onCaptionChange={(photoId, caption) => {
            setDraft({
              ...draft,
              photos: draft.photos.map((photo) => (photo.id === photoId ? { ...photo, caption } : photo)),
            });
            setErrors((current) => clearError(current, `caption:${photoId}`));
          }}
          onCoverChange={(photoId) => setDraft({ ...draft, coverPhotoId: photoId })}
        />

        <div className="flex flex-col">
          <label htmlFor="date" className={labelClassName}>
            {isPeriod ? "시작 날짜" : "날짜"}
          </label>
          <DatePickerField
            id="date"
            label={isPeriod ? "시작 날짜" : "날짜"}
            max={today}
            value={draft.date}
            isDisabled={isSaving}
            isInvalid={Boolean(errors.date)}
            describedBy={errors.date ? "date-error" : undefined}
            onChange={(date) => updateField("date", date)}
            className={inputClassName}
          />
          {errors.date && (
            <p id="date-error" className={errorClassName}>
              {errors.date}
            </p>
          )}
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
            <>
              <label htmlFor="endDate" className={`${labelClassName} mt-2`}>
                끝 날짜
              </label>
              <DatePickerField
                id="endDate"
                label="끝 날짜"
                min={getMinEndDate(draft.date, today)}
                max={today}
                value={draft.endDate ?? ""}
                openDate={draft.date}
                isDisabled={isSaving}
                isInvalid={Boolean(errors.endDate)}
                describedBy={errors.endDate ? "endDate-error" : undefined}
                onChange={(date) => updateField("endDate", date)}
                className={inputClassName}
              />
              {errors.endDate && (
                <p id="endDate-error" className={errorClassName}>
                  {errors.endDate}
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex flex-col">
          <label htmlFor="title" className={labelClassName}>
            제목
          </label>
          <input
            id="title"
            value={draft.title}
            placeholder="어떤 데이트였나요?"
            maxLength={TITLE_MAX_LENGTH * 2}
            disabled={isSaving}
            aria-invalid={Boolean(errors.title)}
            aria-describedby={errors.title ? "title-error" : undefined}
            onChange={(event) => updateField("title", event.target.value)}
            className={inputClassName}
          />
          {errors.title && (
            <p id="title-error" className={errorClassName}>
              {errors.title}
            </p>
          )}
        </div>

        <PlaceField
          key={placeFieldKey}
          value={draft.place}
          location={draft.location}
          error={errors.place}
          isDisabled={isSaving}
          canSearch={canSearchPlace}
          labelAction={
            !isTagFieldOpen && (
              <button
                type="button"
                disabled={isSaving}
                onClick={handleOpenTagField}
                // 글자 줄만큼만 차지하면서 44px을 누를 수 있게 넓힌다. 아래 입력 칸의 오른쪽 위 끝이 조금 겹치므로 칸보다 위에 둔다
                className="relative z-10 text-[13px] leading-[19px] text-ink-sub after:absolute after:-inset-y-[12.5px] after:inset-x-0 disabled:opacity-50"
              >
                태그 추가
              </button>
            )
          }
          // 이름을 고치면 좌표가 다른 곳을 가리킬 수 있어 함께 지운다
          onChange={(value) => updatePlace({ place: value, location: undefined })}
          onSelect={({ name, lat, lng }) => updatePlace({ place: takeChars(name, PLACE_MAX_LENGTH), location: { lat, lng } })}
          onClearLocation={() => updatePlace({ location: undefined })}
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
              setDraft({ ...draft, tags: draft.tags.filter((existing) => existing !== tag) });
              setErrors((current) => clearError(current, "tags"));
            }}
          />
        )}

        <div className="flex grow flex-col">
          <div className="flex items-baseline justify-between">
            <label htmlFor="memo" className={labelClassName}>
              정리 글 <span className="text-ink-placeholder">(선택)</span>
            </label>
            <span id="memo-count" className="font-display text-[12px] tracking-[1px] text-ink-sub">
              {countChars(draft.memo.trim()).toLocaleString()}/{MEMO_MAX_LENGTH.toLocaleString()}
            </span>
          </div>
          <textarea
            id="memo"
            value={draft.memo}
            // 최소 4줄. 남은 공간은 grow로 채우고, 사진·오류 문구로 내용이 길어지면 4줄을 남기고 페이지가 스크롤된다
            rows={4}
            placeholder="오늘 하루를 길게 남겨 두세요"
            disabled={isSaving}
            aria-invalid={Boolean(errors.memo)}
            aria-describedby={errors.memo ? "memo-count memo-error" : "memo-count"}
            onChange={(event) => updateField("memo", event.target.value)}
            className={`${inputClassName} h-auto grow resize-y py-3 leading-[1.5]`}
          />
          {errors.memo && (
            <p id="memo-error" className={errorClassName}>
              {errors.memo}
            </p>
          )}
        </div>

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
              className="h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background"
            >
              기록 목록으로
            </button>
          ) : draft.hasConflict ? (
            // 다시 저장해도 거부되므로 저장 버튼 대신 최신 내용을 불러오는 길을 준다
            <button
              type="button"
              disabled={isReloading}
              onClick={handleReloadLatest}
              className="h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
            >
              {isReloading ? "불러오는 중…" : "최신 내용 불러오기"}
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSaving}
              className="h-[52px] w-full rounded-[10px] bg-accent font-display text-[15px] text-background disabled:opacity-50"
            >
              {progress ? toProgressLabel(progress) : isSaving ? "저장 중…" : "저장"}
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
