"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef, useState, type ReactElement, type SubmitEvent } from "react";
import { BackIcon } from "@/components/icons";
import { PageShell } from "@/components/PageShell";
import { toKstDate } from "@/lib/anniversary";
import {
  MEMO_MAX_LENGTH,
  PLACE_MAX_LENGTH,
  TITLE_MAX_LENGTH,
  addPhotos,
  movePhoto,
  removePhoto,
  validateDraft,
  type DateRecordDraft,
  type DraftErrors,
  type RecordPrefill,
} from "@/lib/dates/form";
import { clearError, countChars } from "@/lib/form";
import type { EditableRecord } from "@/lib/dates/detail";
import { SaveDateRecordError, saveDateRecord, updateDateRecord, type SaveProgress } from "@/lib/dates/save";
import { PhotoError } from "@/lib/photos/errors";
import { ALBUM_BUCKET } from "@/lib/photos/limits";
import { isAcceptedPhoto, resizePhoto } from "@/lib/photos/resize";
import { createClient } from "@/lib/supabase/client";
import { PhotoPicker, type PickedPhoto } from "./PhotoPicker";

const labelClassName = "text-[13px] text-ink-sub";
const inputClassName =
  "mt-2 h-[51px] w-full rounded-[10px] border border-line bg-surface px-4 text-[15px] text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none aria-[invalid=true]:border-accent";
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
  title: prefill?.title ?? "",
  place: prefill?.place ?? "",
  memo: "",
  photos: [],
  coverPhotoId: undefined,
});

const toEditDraft = ({ date, title, place, memo, coverPhotoId, photos }: EditableRecord): DateRecordDraft<PickedPhoto> => ({
  date,
  title,
  place,
  memo,
  coverPhotoId,
  photos: photos.map((photo) => ({ ...photo, file: undefined })),
});

interface DateRecordFormProps {
  /** 고칠 기록. 없으면 새 기록을 쓴다 */
  record?: EditableRecord;
  /** 새 기록에 미리 채울 값(지난 일정에서 넘어온 경우) */
  prefill?: RecordPrefill;
}

/** 데이트 기록 작성·수정 폼. 새로 고른 사진을 줄여 올린 뒤 기록과 사진 행을 한 번에 저장한다. */
export const DateRecordForm = ({ record, prefill }: DateRecordFormProps): ReactElement => {
  const router = useRouter();
  const [draft, setDraft] = useState(() => (record ? toEditDraft(record) : createEmptyDraft(prefill)));
  const [errors, setErrors] = useState<DraftErrors>({});
  const [notice, setNotice] = useState<string>();
  const [progress, setProgress] = useState<SaveProgress>();
  const [isSaving, setIsSaving] = useState(false);
  const today = toKstDate(new Date());

  // 만든 미리보기 URL. 사진을 빼거나 화면을 떠날 때 해제한다(브라우저 메모리 = 외부 자원)
  const previewUrlsRef = useRef(new Set<string>());
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

  const updateField = (field: "date" | "title" | "place" | "memo", value: string) => {
    setDraft((current) => ({ ...current, [field]: value }));
    setErrors((current) => clearError(current, field));
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

  const handleSubmit = async (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSaving) return;

    const nextErrors = validateDraft(draft, today);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setNotice("입력한 내용을 확인해 주세요.");
      return;
    }

    setNotice(undefined);
    setIsSaving(true);
    try {
      const supabase = createClient();
      const storage = supabase.storage.from(ALBUM_BUCKET);
      const files = new Map(draft.photos.flatMap(({ id, file }) => (file ? [[id, file] as const] : [])));
      if (record) {
        await updateDateRecord({
          recordId: record.id,
          draft,
          files,
          storage,
          resize: resizePhoto,
          updateRecord: (args) => supabase.rpc("update_date_record", args),
          onProgress: setProgress,
        });
      } else {
        await saveDateRecord({
          recordId: crypto.randomUUID(),
          draft,
          files,
          storage,
          resize: resizePhoto,
          createRecord: (args) => supabase.rpc("create_date_record", args),
          onProgress: setProgress,
        });
      }
      // cacheComponents는 다녀온 화면을 Activity로 숨겨 상태를 보존한다. 다시 열었을 때 처음 상태가 되도록
      // 이동과 같은 transition에서 되돌린다(이동이 끝날 때 함께 반영돼 빈 폼이 잠깐 보이지 않는다)
      // 이미 그려진 미리보기는 URL을 해제해도 그대로 보인다. 수정 화면은 페이지가 매번 새 key로 다시 그린다
      draft.photos.forEach(({ previewUrl }) => revokePreview(previewUrl));
      startTransition(() => {
        router.replace(record ? `/dates/${record.id}` : "/");
        router.refresh();
        setDraft(record ? toEditDraft(record) : createEmptyDraft());
        setErrors({});
        setNotice(undefined);
        setProgress(undefined);
        setIsSaving(false);
      });
    } catch (error) {
      setNotice(toSaveErrorMessage(error));
      setIsSaving(false);
      setProgress(undefined);
    }
  };

  return (
    <PageShell
      bottomSpace="sm"
      className="px-4"
      header={
        <header className="flex items-center px-2">
          <Link
            href={record ? `/dates/${record.id}` : "/"}
            aria-label={record ? "기록으로" : "홈으로"}
            className="flex size-11 items-center justify-center text-ink-sub hover:text-ink"
          >
            <BackIcon className="size-[22px]" />
          </Link>
          <h1 className="text-[17px] text-ink">{record ? "기록 고치기" : "기록 남기기"}</h1>
        </header>
      }
    >
      {/* 폼을 화면 남은 높이까지 늘리고 정리 글 칸이 그 여유를 채운다. 칸을 고정 줄 수로 두면 기기 높이에 따라 조금씩 넘쳐 스크롤이 생긴다(#52) */}
      <form onSubmit={handleSubmit} noValidate className="mt-6 flex flex-1 flex-col gap-6">
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
            날짜
          </label>
          <input
            id="date"
            type="date"
            max={today}
            value={draft.date}
            disabled={isSaving}
            aria-invalid={Boolean(errors.date)}
            aria-describedby={errors.date ? "date-error" : undefined}
            onChange={(event) => updateField("date", event.target.value)}
            className={inputClassName}
          />
          {errors.date && (
            <p id="date-error" className={errorClassName}>
              {errors.date}
            </p>
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

        <div className="flex flex-col">
          <label htmlFor="place" className={labelClassName}>
            장소 <span className="text-ink-placeholder">(선택)</span>
          </label>
          <input
            id="place"
            value={draft.place}
            placeholder="성수동"
            maxLength={PLACE_MAX_LENGTH * 2}
            disabled={isSaving}
            aria-invalid={Boolean(errors.place)}
            aria-describedby={errors.place ? "place-error" : undefined}
            onChange={(event) => updateField("place", event.target.value)}
            className={inputClassName}
          />
          {errors.place && (
            <p id="place-error" className={errorClassName}>
              {errors.place}
            </p>
          )}
        </div>

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
            className={`${inputClassName} h-auto grow resize-y py-3 leading-[1.6]`}
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
          <button
            type="submit"
            disabled={isSaving}
            className="h-[52px] w-full rounded-[10px] bg-accent text-[15px] font-bold text-background disabled:opacity-50"
          >
            {progress ? toProgressLabel(progress) : isSaving ? "저장 중…" : "저장"}
          </button>
          <p aria-live="polite" className="sr-only">
            {progress ? toProgressLabel(progress) : ""}
          </p>
        </div>
      </form>
    </PageShell>
  );
};
