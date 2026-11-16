"use client";

import { useRef, useState, type SyntheticEvent } from "react";
import { shouldHidePreview, type CouplePhotoPreview } from "@/lib/couple-photo/preview";

interface CouplePhotoPreviewState {
  /** 지금 미리 보여 주는 사진. 그리기에 쓴다 */
  preview: CouplePhotoPreview | undefined;
  /** 저장을 기다리는 동안 그 사진이 아직 미리 보여 주는 사진인지. 그사이 다른 사진을 골랐으면 false */
  isCurrentPreview: (photoId: string) => boolean;
  /** 미리 보여 줄 사진을 바꾼다. 더 쓰지 않는 사진 주소는 놓아준다 */
  showPreview: (next: CouplePhotoPreview | undefined) => void;
  /** 브라우저가 고른 사진을 그리지 못하면(Chrome의 HEIC 등) 줄인 사진을 기다리게 바꾼다 */
  handlePreviewError: (event: SyntheticEvent<HTMLImageElement>) => void;
  /** 서버 사진을 다 받아 그리면 부른다. 새로 저장한 사진이면 미리 보기를 치운다 */
  handleServerPhotoLoaded: () => void;
}

/**
 * 커플 사진을 저장하기 전에 먼저 보여 주는 고른 사진(#329).
 *
 * @example const { preview, isCurrentPreview, showPreview, handlePreviewError, handleServerPhotoLoaded } = useCouplePhotoPreview(photo?.path)
 */
export const useCouplePhotoPreview = (photoPath: string | undefined): CouplePhotoPreviewState => {
  const [preview, setPreview] = useState<CouplePhotoPreview>();
  // 저장 결과를 기다리는 동안 지금 미리 보여 주는 사진을 알아야 해서 함께 둔다(바꾸거나 치울 때 이전 주소를 놓아준다)
  const previewRef = useRef<CouplePhotoPreview>(undefined);

  const showPreview = (next: CouplePhotoPreview | undefined) => {
    const previousUrl = previewRef.current?.url;
    if (previousUrl && previousUrl !== next?.url) URL.revokeObjectURL(previousUrl);
    previewRef.current = next;
    setPreview(next);
  };

  const handlePreviewError = (event: SyntheticEvent<HTMLImageElement>) => {
    const current = previewRef.current;
    if (current?.url !== event.currentTarget.getAttribute("src")) return;
    showPreview({ ...current, url: undefined });
  };

  const handleServerPhotoLoaded = () => {
    if (shouldHidePreview(previewRef.current, photoPath)) showPreview(undefined);
  };

  const isCurrentPreview = (photoId: string) => previewRef.current?.photoId === photoId;

  return { preview, isCurrentPreview, showPreview, handlePreviewError, handleServerPhotoLoaded };
};
