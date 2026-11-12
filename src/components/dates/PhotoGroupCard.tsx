"use client";

import { useRef, useState, type ReactElement } from "react";
import { FieldError, FieldLabel } from "@/components/FormField";
import { ChevronDownIcon, ChevronUpIcon, CloseIcon, MapPinIcon } from "@/components/icons";
import { CAPTION_MAX_LENGTH, type DraftErrors, type DraftPhoto, type DraftPhotoGroup, type GroupLocationSource } from "@/lib/dates/form";
import { toGroupName } from "@/lib/dates/group-name";
import { MAX_GROUP_PHOTOS } from "@/lib/dates/photo-group-draft";
import { countChars } from "@/lib/form";
import { runKeepingFocus } from "@/lib/keep-focus";
import { PHOTO_INPUT_ACCEPT } from "@/lib/photos/resize";

export interface PickedPhoto extends DraftPhoto {
  /** 이번에 새로 고른 사진의 파일. 이미 저장된 사진(수정 화면)은 undefined */
  file: File | undefined;
  /** 새 사진은 object URL(빼거나 화면을 떠날 때 해제), 저장된 사진은 썸네일 서명 URL */
  previewUrl: string | undefined;
  /** 새로 고른 사진에서 찍은 곳·찍은 시각을 읽는 중인지. 그동안 저장 버튼을 막는다 */
  isReadingInfo: boolean;
}

/** 모음 카드에서 일어나는 일. 모음 목록(PhotoGroupsField)이 폼에 그대로 넘긴다 */
export interface PhotoGroupActions {
  onSelectPhoto: (photoId: string | undefined) => void;
  onAddPhotos: (groupId: string, files: File[]) => void;
  onRemoveGroup: (groupId: string) => void;
  onMoveGroup: (index: number, offset: -1 | 1) => void;
  onRemovePhoto: (photoId: string) => void;
  onMovePhoto: (photoId: string, offset: -1 | 1) => void;
  onCaptionChange: (groupId: string, caption: string) => void;
  onCoverChange: (photoId: string) => void;
  onOpenLocation: (groupId: string) => void;
}

interface PhotoGroupCardProps {
  group: DraftPhotoGroup<PickedPhoto>;
  /** 화면 순서(0부터) */
  index: number;
  groupCount: number;
  coverPhotoId: string | undefined;
  selectedPhotoId: string | undefined;
  errors: DraftErrors;
  isDisabled: boolean;
  actions: PhotoGroupActions;
  /** 모음이 빠져 이웃 모음도 없을 때 초점을 받을 곳(새 모음 만들기) */
  focusFallback: () => HTMLElement | null;
}

const LOCATION_SOURCE_TEXT: Record<GroupLocationSource, string | undefined> = {
  photo: "첫 사진 정보에서 읽었어요",
  picked: "직접 골랐어요",
  saved: undefined,
};

// 보이는 크기는 36px로 두고 누르는 영역만 44px로 넓힌다. 버튼 사이 간격(8px)을 반씩 나눠 가져 서로 겹치지 않는다(#105).
// 가상 요소는 테두리 안쪽을 기준으로 놓이므로 테두리 1px을 더해 5px 넓힌다
const smallButtonClassName =
  "press-icon relative h-9 min-w-9 rounded-[8px] border border-line px-2 text-[12px] text-ink-sub after:absolute after:-inset-[5px] hover:text-ink disabled:opacity-30 aria-disabled:opacity-30";

// 머리글의 아이콘 버튼은 테두리가 없어 보이는 크기 그대로 44px로 둔다
const iconButtonClassName =
  "press-icon flex size-11 items-center justify-center text-ink-sub hover:text-ink disabled:opacity-30 aria-disabled:opacity-30";

interface PhotoThumbProps {
  src: string | undefined;
}

/** 사진 줄의 작은 미리보기. HEIC처럼 브라우저가 그리지 못하는 사진은 저장할 때 변환되므로 대체 문구만 보여 준다 */
const PhotoThumb = ({ src }: PhotoThumbProps): ReactElement => {
  const [hasFailed, setHasFailed] = useState(false);
  if (hasFailed || !src) {
    return <span className="flex size-full items-center justify-center px-1 text-center text-[10px] leading-tight text-ink-sub">미리보기 없음</span>;
  }
  // eslint-disable-next-line @next/next/no-img-element -- 업로드 전 object URL 미리보기라 next/image 최적화 대상이 아니다
  return <img src={src} alt="" onError={() => setHasFailed(true)} className="size-full object-cover" />;
};

/**
 * 사진 모음 하나(#298): 모음 이름·장수와 위·아래·빼기, 위치 줄, 사진 줄, 사진 더하기, 누른 사진의 순서·대표·빼기, 모음 한마디.
 * 위치와 한마디(#309)는 모음마다 하나라 사진마다 묻지 않는다. 사진을 다른 모음으로 옮기는 기능은 없다(2026-11-11 사용자 결정).
 *
 * @example <PhotoGroupCard group={group} index={0} groupCount={2} coverPhotoId={cover} selectedPhotoId={undefined} errors={{}} isDisabled={false} actions={actions} focusFallback={() => pickRef.current} />
 */
export const PhotoGroupCard = ({
  group,
  index,
  groupCount,
  coverPhotoId,
  selectedPhotoId,
  errors,
  isDisabled,
  actions,
  focusFallback,
}: PhotoGroupCardProps): ReactElement => {
  const inputRef = useRef<HTMLInputElement>(null);
  const name = toGroupName(index + 1);
  const headingId = `photo-group-${group.id}`;
  const locationError = errors[`group:${group.id}`];
  const isReadingLocation = group.pendingLocationPhotoId !== undefined;
  const room = MAX_GROUP_PHOTOS - group.photos.length;
  const selectedIndex = group.photos.findIndex(({ id }) => id === selectedPhotoId);
  const selected = group.photos[selectedIndex];
  const captionId = `${headingId}-caption`;
  const captionError = errors[`caption:${group.id}`];
  const locationNote = isReadingLocation
    ? undefined
    : group.location
      ? group.locationSource && LOCATION_SOURCE_TEXT[group.locationSource]
      : "첫 사진에 위치 정보가 없어요";

  return (
    <li aria-labelledby={headingId} className="flex flex-col gap-2.5 rounded-[12px] bg-surface p-3">
      <div className="-my-1 -mr-2 flex items-center justify-between">
        <h3 id={headingId} className="font-display text-[16px]">
          {name} <span className="font-sans text-[12px] text-ink-sub">{group.photos.length}장</span>
        </h3>
        <div className="flex">
          {/* 끝에 있는 순서 버튼은 초점을 잃지 않도록 disabled 대신 aria-disabled로 둔다. 끝을 넘는 이동은 moveItem이 무시한다 */}
          <button
            type="button"
            aria-label={`${name} 위로 옮기기`}
            disabled={isDisabled}
            aria-disabled={index === 0}
            onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => actions.onMoveGroup(index, -1) })}
            className={iconButtonClassName}
          >
            <ChevronUpIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`${name} 아래로 옮기기`}
            disabled={isDisabled}
            aria-disabled={index === groupCount - 1}
            onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => actions.onMoveGroup(index, 1) })}
            className={iconButtonClassName}
          >
            <ChevronDownIcon className="size-4" />
          </button>
          <button
            type="button"
            aria-label={`${name} 빼기`}
            data-group-remove
            disabled={isDisabled}
            onClick={(event) =>
              runKeepingFocus({
                button: event.currentTarget,
                change: () => actions.onRemoveGroup(group.id),
                neighborSelector: "[data-group-remove]",
                fallback: focusFallback(),
              })
            }
            className={iconButtonClassName}
          >
            <CloseIcon className="size-4" />
          </button>
        </div>
      </div>

      <div className={`flex items-center gap-2 rounded-[10px] border bg-background px-3 py-2 ${locationError ? "border-accent" : "border-line"}`}>
        <MapPinIcon className={`size-[18px] shrink-0 ${group.location ? "text-accent" : "text-ink-sub"}`} />
        <div className="flex min-w-0 flex-1 flex-col">
          <p className={`truncate text-[14px] ${group.location ? "text-ink" : "text-ink-sub"}`}>
            <span className="sr-only">{name} 위치: </span>
            {isReadingLocation ? "위치 읽는 중…" : (group.location?.place ?? "위치 없음")}
          </p>
          {locationNote && <p className="text-[11px] text-ink-sub">{locationNote}</p>}
        </div>
        {/* 위치를 고르면 이름만 바뀌는 같은 버튼이라, 창이 닫히며 돌아온 초점을 잃지 않는다.
            첫 사진 정보를 읽는 동안은 읽은 위치와 엇갈리지 않게 누를 수 없다. 위치가 없으면 저장할 때 첫 오류 칸이 된다(data-invalid) */}
        <button
          type="button"
          disabled={isDisabled || isReadingLocation}
          data-invalid={Boolean(locationError)}
          aria-describedby={locationError ? `${headingId}-location-error` : undefined}
          onClick={() => actions.onOpenLocation(group.id)}
          className={
            group.location || isReadingLocation
              ? "press-icon relative h-9 shrink-0 rounded-[8px] border border-line px-2.5 text-[12px] text-ink-sub after:absolute after:-inset-[5px] disabled:opacity-50"
              : "press-icon relative h-9 shrink-0 rounded-[8px] bg-accent px-3 text-[13px] text-background after:absolute after:-inset-[5px] disabled:opacity-50"
          }
        >
          {group.location || isReadingLocation ? "위치 바꾸기" : "지도에서 고르기"}
          <span className="sr-only"> ({name})</span>
        </button>
      </div>
      <FieldError id={`${headingId}-location-error`} error={locationError} />

      <ul aria-label={`${name} 사진`} className="-mx-3 flex gap-1.5 overflow-x-auto px-3">
        {group.photos.map((photo, photoIndex) => {
          const isSelected = photo.id === selectedPhotoId;
          return (
            // key는 사진 id로 둔다. 다른 화면에 다녀오면 미리보기 주소가 해제돼 있어, 미리보기를 다시 만들면 깨진다(#280, usePreviewUrls)
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`${name}의 ${photoIndex + 1}번째 사진${photo.id === coverPhotoId ? " (대표)" : ""}`}
                disabled={isDisabled}
                onClick={() => actions.onSelectPhoto(isSelected ? undefined : photo.id)}
                className={`press-icon relative block size-14 overflow-hidden rounded-[8px] bg-background disabled:opacity-50 ${isSelected ? "ring-2 ring-accent ring-inset" : ""}`}
              >
                <PhotoThumb src={photo.previewUrl} />
                {photo.id === coverPhotoId && (
                  <span aria-hidden="true" className="absolute top-[3px] left-[3px] rounded-[4px] bg-accent px-1 text-[10px] text-background">
                    대표
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      <input
        ref={inputRef}
        type="file"
        accept={PHOTO_INPUT_ACCEPT}
        multiple
        hidden
        onChange={(event) => {
          actions.onAddPhotos(group.id, Array.from(event.target.files ?? []));
          // 같은 사진을 뺐다가 다시 고를 수 있도록 선택값을 비운다
          event.target.value = "";
        }}
        aria-label={`${name}에 더할 사진 고르기`}
      />
      <button
        type="button"
        disabled={isDisabled || room <= 0}
        onClick={() => inputRef.current?.click()}
        className="press-icon relative h-9 self-start rounded-[8px] border border-dashed border-line px-3 text-[12px] text-ink-sub after:absolute after:-inset-[5px] hover:text-ink disabled:opacity-40"
      >
        {room > 0 ? `+ 이 모음에 사진 더하기 (${room}장 남음)` : `모음 하나에 ${MAX_GROUP_PHOTOS}장까지예요`}
      </button>

      {selected && (
        // 사진을 누르면 순서·대표·빼기만 연다. 한마디는 모음마다 하나라 아래 칸에 쓴다(#309)
        <div role="group" aria-label={`${name}의 ${selectedIndex + 1}번째 사진`} className="border-t border-line pt-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="text-[12px] text-ink-sub">
              {selectedIndex + 1}번째 사진
            </span>
            <button
              type="button"
              aria-pressed={selected.id === coverPhotoId}
              disabled={isDisabled}
              onClick={() => actions.onCoverChange(selected.id)}
              className={`${smallButtonClassName} aria-pressed:border-accent aria-pressed:text-accent`}
            >
              대표로
            </button>
            {/* 끝에 있는 순서 버튼은 초점을 잃지 않도록 disabled 대신 aria-disabled로 둔다. 끝을 넘는 이동은 moveItem이 무시한다 */}
            <button
              type="button"
              disabled={isDisabled}
              aria-disabled={selectedIndex === 0}
              onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => actions.onMovePhoto(selected.id, -1) })}
              className={smallButtonClassName}
            >
              앞으로
            </button>
            <button
              type="button"
              disabled={isDisabled}
              aria-disabled={selectedIndex === group.photos.length - 1}
              onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => actions.onMovePhoto(selected.id, 1) })}
              className={smallButtonClassName}
            >
              뒤로
            </button>
            <button
              type="button"
              disabled={isDisabled}
              // 빼면 같은 자리의 다음 사진이 골라져 이 버튼이 그대로 남는다. 모음의 마지막 사진이면 모음이 빠져 새 모음 만들기로 간다
              onClick={(event) => runKeepingFocus({ button: event.currentTarget, change: () => actions.onRemovePhoto(selected.id), fallback: focusFallback() })}
              className={`${smallButtonClassName} ml-auto`}
            >
              이 사진 빼기
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-col border-t border-line pt-2.5">
        <FieldLabel
          htmlFor={captionId}
          label={
            <>
              한마디<span className="sr-only"> ({name})</span>
            </>
          }
          hint="선택"
          aside={
            <span id={`${captionId}-count`} className="font-display text-[12px] tracking-[1px] text-ink-sub">
              {countChars(group.caption.trim())}/{CAPTION_MAX_LENGTH}
            </span>
          }
        />
        {/* 넘쳐도 지우지 않고 저장할 때 알리도록 제한의 두 배까지 받는다. 저장은 100자까지다(DB 제약과 같다).
            칸은 글에 맞춰 늘어난다. 두 줄로 고정하면 긴 한마디가 칸 안에서 스크롤돼 첫 줄이 잘려 보인다 */}
        <textarea
          id={captionId}
          rows={2}
          value={group.caption}
          maxLength={CAPTION_MAX_LENGTH * 2}
          disabled={isDisabled}
          aria-invalid={Boolean(captionError)}
          aria-describedby={[`${captionId}-count`, captionError && `${captionId}-error`].filter(Boolean).join(" ")}
          onChange={(event) => actions.onCaptionChange(group.id, event.target.value)}
          className="mt-2 field-sizing-content min-h-[70px] w-full resize-none rounded-[8px] border border-line bg-background px-3 py-2.5 text-[16px] leading-[1.5] text-ink focus:border-accent focus:outline-none aria-[invalid=true]:border-accent disabled:opacity-50"
        />
        <FieldError id={`${captionId}-error`} error={captionError} />
      </div>
    </li>
  );
};
