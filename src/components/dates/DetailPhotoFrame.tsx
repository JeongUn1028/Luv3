"use client";

import { useState, type ReactElement } from "react";
import { SignedPhoto } from "@/components/SignedPhoto";

interface DetailPhotoFrameProps {
  /** 서명 주소. 서명하지 못했거나 아직 받을 차례가 아니면 없다 */
  url: string | undefined;
  /** 원본을 받는 동안 먼저 보여 줄 썸네일 주소(#313). 없으면 받는 동안 회색 칸이다 */
  placeholderUrl?: string;
  alt: string;
  /** 지금 보는 사진은 high, 미리 받는 사진은 low로 둬 지금 사진이 먼저 오게 한다(#313) */
  fetchPriority: "high" | "low";
  /** 원본을 다 받으면 불린다. 같은 사진에 두 번 불릴 수 있다 */
  onShown?: () => void;
}

/** 다 받은 사진. 칸(4:5)보다 넓은 사진은 폭을, 좁은 사진은 높이를 칸에 맞춘다 */
interface LoadedPhoto {
  url: string;
  isWiderThanFrame: boolean;
}

const FRAME_RATIO = 4 / 5;

const toLoadedPhoto = (url: string, image: HTMLImageElement): LoadedPhoto => ({ url, isWiderThanFrame: image.naturalWidth / image.naturalHeight > FRAME_RATIO });

// 다 받으면 한쪽 길이만 칸에 맞추고 다른 쪽은 사진 비율대로 둬, 칸보다 작은 사진도 칸에 맞게 키운다. 사방 0 + 바깥 여백 auto로 가운데 둔다.
// 받기 전에는 크기를 몰라 칸을 채운 채 숨겨, 깨진 사진 표시도 보이지 않는다.
// 넘기는 동안 움직이는 줄 안에서 자르기(overflow-hidden)가 풀리는 WebKit 문제를 피해 사진에 직접 모서리를 준다(#321)
const toPhotoClassName = (loaded: LoadedPhoto | undefined): string =>
  `absolute inset-0 ${loaded ? `m-auto rounded-[16px] ${loaded.isWiderThanFrame ? "w-full" : "h-full"}` : "size-full opacity-0"}`;

/**
 * 기록 상세의 4:5 사진 칸(#326). 칸 높이를 고정해 사진을 넘겨도 아래 글자가 움직이지 않는다.
 * 사진은 자르지 않고 칸 안에 사진 비율대로 가운데 두며, 빈 곳은 앱 배경이 보이고 모서리는 보이는 사진에 준다.
 * 사진을 받는 동안과 받지 못했을 때는 불러오는 동안의 뼈대(`RecordDetailSkeleton`)와 같은 회색 칸을 둔다.
 * 썸네일 주소를 주면 원본을 받는 동안 썸네일을 같은 자리에 먼저 보여 주고, 원본을 받으면 바꾼다(#313).
 *
 * @example <DetailPhotoFrame url={photo.url} placeholderUrl={photo.thumbUrl} alt="성수 데이트 사진 1" fetchPriority="high" />
 */
export const DetailPhotoFrame = ({ url, placeholderUrl, alt, fetchPriority, onShown }: DetailPhotoFrameProps): ReactElement => {
  const [loaded, setLoaded] = useState<LoadedPhoto>();
  const [preview, setPreview] = useState<LoadedPhoto>();
  // 주소가 바뀌면(새로 서명) 그 주소를 다 받을 때까지 다시 회색 칸으로 둔다
  const shown = url !== undefined && loaded?.url === url ? loaded : undefined;
  // 원본과 같은 파일이면 같은 주소라 따로 그리지 않는다
  const previewUrl = shown || placeholderUrl === url ? undefined : placeholderUrl;
  const shownPreview = previewUrl !== undefined && preview?.url === previewUrl ? preview : undefined;

  const handleLoaded = (image: HTMLImageElement) => {
    if (url === undefined) return;
    setLoaded(toLoadedPhoto(url, image));
    onShown?.();
  };

  const handlePreviewLoaded = (image: HTMLImageElement) => {
    if (previewUrl !== undefined) setPreview(toLoadedPhoto(previewUrl, image));
  };

  return (
    <div className={`relative aspect-[4/5] rounded-[16px] ${shown || shownPreview ? "" : "bg-surface"}`}>
      {previewUrl && (
        <SignedPhoto
          src={previewUrl}
          alt=""
          // 목록 칸에서 받아 휴대폰에 남아 있으면 우선순위와 상관없이 바로 보인다. 새로 받아야 하면 원본보다 뒤로 둬 원본을 늦추지 않는다
          fetchPriority="low"
          draggable={false}
          // 썸네일을 못 받으면 화면을 새로 받지 않고 원본을 기다린다
          onLoadFailed={() => true}
          onLoaded={handlePreviewLoaded}
          className={toPhotoClassName(shownPreview)}
        />
      )}
      {url && (
        <SignedPhoto
          src={url}
          alt={alt}
          // 받을 차례는 부르는 쪽(`PhotoCarousel`)이 주소를 넘기는 때로 정하므로 브라우저가 미루지 않게 한다
          loading="eager"
          fetchPriority={fetchPriority}
          draggable={false}
          onLoaded={handleLoaded}
          className={toPhotoClassName(shown)}
        />
      )}
    </div>
  );
};
