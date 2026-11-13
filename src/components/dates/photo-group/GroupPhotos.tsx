"use client";

import { useRef, useState, type ReactElement } from "react";
import { MAX_GROUP_PHOTOS } from "@/lib/dates/photo-group-draft";
import { PHOTO_INPUT_ACCEPT } from "@/lib/photos/resize";

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

/** 사진 줄에 그릴 사진. 새 사진은 object URL, 저장된 사진은 썸네일 서명 URL이다 */
interface GroupPhotoItem {
  id: string;
  previewUrl: string | undefined;
}

interface GroupPhotosProps {
  /** 화면 읽기 프로그램에 읽어 줄 모음 이름(모음 1) */
  groupName: string;
  photos: GroupPhotoItem[];
  coverPhotoId: string | undefined;
  selectedPhotoId: string | undefined;
  isDisabled: boolean;
  /** 사진을 누르면 고르고, 고른 사진을 다시 누르면 고르기를 푼다(undefined) */
  onSelectPhoto: (photoId: string | undefined) => void;
  /** 이 모음에 더할 사진을 골랐을 때 */
  onAddPhotos: (files: File[]) => void;
}

/**
 * 모음 카드의 사진 줄과 사진 더하기(#298). 사진을 누르면 아래에 그 사진의 순서·대표·빼기가 열린다.
 *
 * @example <GroupPhotos groupName="모음 1" photos={group.photos} coverPhotoId={cover} selectedPhotoId={selected} isDisabled={false} onSelectPhoto={select} onAddPhotos={add} />
 */
export const GroupPhotos = ({ groupName, photos, coverPhotoId, selectedPhotoId, isDisabled, onSelectPhoto, onAddPhotos }: GroupPhotosProps): ReactElement => {
  const inputRef = useRef<HTMLInputElement>(null);
  const room = MAX_GROUP_PHOTOS - photos.length;

  return (
    <>
      <ul aria-label={`${groupName} 사진`} className="-mx-3 flex gap-1.5 overflow-x-auto px-3">
        {photos.map((photo, photoIndex) => {
          const isSelected = photo.id === selectedPhotoId;
          return (
            // key는 사진 id로 둔다. 다른 화면에 다녀오면 미리보기 주소가 해제돼 있어, 미리보기를 다시 만들면 깨진다(#280, usePreviewUrls)
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                aria-pressed={isSelected}
                aria-label={`${groupName}의 ${photoIndex + 1}번째 사진${photo.id === coverPhotoId ? " (대표)" : ""}`}
                disabled={isDisabled}
                onClick={() => onSelectPhoto(isSelected ? undefined : photo.id)}
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
          onAddPhotos(Array.from(event.target.files ?? []));
          // 같은 사진을 뺐다가 다시 고를 수 있도록 선택값을 비운다
          event.target.value = "";
        }}
        aria-label={`${groupName}에 더할 사진 고르기`}
      />
      <button
        type="button"
        disabled={isDisabled || room <= 0}
        onClick={() => inputRef.current?.click()}
        className="press-icon relative h-9 self-start rounded-[8px] border border-dashed border-line px-3 text-[12px] text-ink-sub after:absolute after:-inset-[5px] hover:text-ink disabled:opacity-40"
      >
        {room > 0 ? `+ 이 모음에 사진 더하기 (${room}장 남음)` : `모음 하나에 ${MAX_GROUP_PHOTOS}장까지예요`}
      </button>
    </>
  );
};
