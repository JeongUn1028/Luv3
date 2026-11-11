"use client";

import { useRef, useState, type ChangeEvent, type ReactElement } from "react";
import { FIELD_LABEL_CLASS_NAME, FieldError } from "@/components/FormField";
import { CAPTION_MAX_LENGTH, MAX_PHOTOS, type DraftErrors, type DraftPhoto } from "@/lib/dates/form";
import { runKeepingFocus } from "@/lib/keep-focus";
import { PHOTO_INPUT_ACCEPT } from "@/lib/photos/resize";

export interface PickedPhoto extends DraftPhoto {
  /** 이번에 새로 고른 사진의 파일. 이미 저장된 사진(수정 화면)은 undefined */
  file: File | undefined;
  /** 새 사진은 object URL(빼거나 화면을 떠날 때 해제), 저장된 사진은 썸네일 서명 URL */
  previewUrl: string | undefined;
}

interface PhotoPickerProps {
  photos: PickedPhoto[];
  coverPhotoId: string | undefined;
  errors: DraftErrors;
  isDisabled: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (photoId: string) => void;
  onMove: (index: number, offset: -1 | 1) => void;
  onCaptionChange: (photoId: string, caption: string) => void;
  onCoverChange: (photoId: string) => void;
}

interface PhotoPreviewProps {
  src: string | undefined;
  alt: string;
}

/** 고른 사진 미리보기. HEIC처럼 브라우저가 그리지 못하는 사진은 저장할 때 변환되므로 대체 문구만 보여 준다 */
const PhotoPreview = ({ src, alt }: PhotoPreviewProps): ReactElement => {
  const [hasFailed, setHasFailed] = useState(false);

  if (hasFailed || !src) {
    return (
      <div
        role="img"
        aria-label={alt}
        className="flex h-[100px] w-20 shrink-0 items-center justify-center bg-background px-1 text-center text-[11px] text-ink-sub"
      >
        미리보기 없음
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 업로드 전 object URL 미리보기라 next/image 최적화 대상이 아니다
    <img
      src={src}
      alt={alt}
      onError={() => setHasFailed(true)}
      className="h-[100px] w-20 shrink-0 bg-background object-cover"
    />
  );
};

// 보이는 크기는 36px로 두고 누르는 영역만 44px로 넓힌다. 버튼 사이 간격(8px)을 반씩 나눠 가져 서로 겹치지 않는다(#105).
// 가상 요소는 테두리 안쪽을 기준으로 놓이므로 테두리 1px을 더해 5px 넓힌다
const smallButtonClassName =
  "press-icon relative h-9 min-w-9 rounded-[8px] border border-line px-2 text-[12px] text-ink-sub after:absolute after:-inset-[5px] hover:text-ink disabled:opacity-30 aria-disabled:opacity-30";

/** 사진 고르기 + 고른 사진 목록(미리보기, 한마디, 대표 사진, 순서, 빼기) */
export const PhotoPicker = ({
  photos,
  coverPhotoId,
  errors,
  isDisabled,
  onAdd,
  onRemove,
  onMove,
  onCaptionChange,
  onCoverChange,
}: PhotoPickerProps): ReactElement => {
  const inputRef = useRef<HTMLInputElement>(null);
  const pickButtonRef = useRef<HTMLButtonElement>(null);
  const isFull = photos.length >= MAX_PHOTOS;

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onAdd(Array.from(event.target.files ?? []));
    // 같은 사진을 뺐다가 다시 고를 수 있도록 선택값을 비운다
    event.target.value = "";
  };

  return (
    // 오류 문구는 첫 오류 칸이 되는 사진 고르기 버튼이 설명으로 읽는다. 묶음에도 두면 같은 문구를 두 번 읽는다
    <fieldset className="flex flex-col">
      <legend className={FIELD_LABEL_CLASS_NAME}>
        사진 <span className="font-display tracking-[1px]">{photos.length}/{MAX_PHOTOS}</span>
      </legend>
      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_INPUT_ACCEPT}
        multiple
        hidden
        onChange={handleChange}
        aria-label="사진 고르기"
      />
      {photos.length > 0 && (
        <ol className="mt-2 flex flex-col gap-3">
          {photos.map((photo, index) => {
            const captionError = errors[`caption:${photo.id}`];
            return (
              <li key={photo.id} className="flex gap-3 rounded-[10px] bg-surface p-3">
                <PhotoPreview src={photo.previewUrl} alt={`${index + 1}번째 사진`} />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <label className="sr-only" htmlFor={`caption-${photo.id}`}>
                    {index + 1}번째 사진 한마디
                  </label>
                  <input
                    id={`caption-${photo.id}`}
                    value={photo.caption}
                    placeholder="한마디 (선택)"
                    maxLength={CAPTION_MAX_LENGTH * 2}
                    disabled={isDisabled}
                    aria-invalid={Boolean(captionError)}
                    aria-describedby={captionError ? `caption-error-${photo.id}` : undefined}
                    onChange={(event) => onCaptionChange(photo.id, event.target.value)}
                    className="h-11 w-full rounded-[8px] border border-line bg-background px-3 text-ink placeholder:text-ink-placeholder focus:border-accent focus:outline-none"
                  />
                  {captionError && (
                    <p id={`caption-error-${photo.id}`} className="text-[12px] text-accent">
                      {captionError}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center gap-2">
                    <label className="relative flex h-9 items-center gap-1.5 text-[12px] text-ink-sub after:absolute after:-inset-1">
                      <input
                        type="radio"
                        name="cover"
                        checked={coverPhotoId === photo.id}
                        disabled={isDisabled}
                        onChange={() => onCoverChange(photo.id)}
                        className="size-4 accent-accent"
                      />
                      대표
                    </label>
                    {/* 끝에 있는 순서 버튼은 초점을 잃지 않도록 disabled 대신 aria-disabled로 둔다. 끝을 넘는 이동은 movePhoto가 무시한다 */}
                    <button
                      type="button"
                      aria-label={`${index + 1}번째 사진을 앞으로`}
                      disabled={isDisabled}
                      aria-disabled={index === 0}
                      onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => onMove(index, -1) })}
                      className={smallButtonClassName}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      aria-label={`${index + 1}번째 사진을 뒤로`}
                      disabled={isDisabled}
                      aria-disabled={index === photos.length - 1}
                      onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => onMove(index, 1) })}
                      className={smallButtonClassName}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      aria-label={`${index + 1}번째 사진 빼기`}
                      data-photo-remove
                      disabled={isDisabled}
                      onClick={(event) =>
                        runKeepingFocus({
                          button: event.currentTarget,
                          change: () => onRemove(photo.id),
                          neighborSelector: "[data-photo-remove]",
                          fallback: pickButtonRef.current,
                        })
                      }
                      className={`${smallButtonClassName} ml-auto`}
                    >
                      빼기
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <button
        ref={pickButtonRef}
        type="button"
        disabled={isDisabled || isFull}
        // 사진이 없으면 저장할 때 이 버튼이 첫 오류 칸이 된다. 버튼에는 aria-invalid를 쓸 수 없어 data로 표시한다(DatePickerField와 같다)
        data-invalid={Boolean(errors.photos)}
        aria-describedby={errors.photos ? "photos-error" : undefined}
        onClick={() => inputRef.current?.click()}
        className="press-wide mt-2 h-[51px] w-full rounded-[10px] border border-dashed border-line text-[15px] text-ink-sub hover:text-ink disabled:opacity-40 data-[invalid=true]:border-accent"
      >
        {isFull ? "사진은 10장까지 올릴 수 있어요" : "사진 고르기"}
      </button>
      <FieldError id="photos-error" error={errors.photos} />
    </fieldset>
  );
};
