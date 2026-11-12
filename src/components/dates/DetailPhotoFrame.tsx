"use client";

import { useState, type ReactElement } from "react";
import { SignedPhoto } from "@/components/SignedPhoto";

interface DetailPhotoFrameProps {
  /** 서명 주소. 서명하지 못했으면 없다 */
  url: string | undefined;
  alt: string;
  loading: "eager" | "lazy";
}

/** 다 받은 사진. 칸(4:5)보다 넓은 사진은 폭을, 좁은 사진은 높이를 칸에 맞춘다 */
interface LoadedPhoto {
  url: string;
  isWiderThanFrame: boolean;
}

const FRAME_RATIO = 4 / 5;

/**
 * 기록 상세의 4:5 사진 칸(#326). 칸 높이를 고정해 사진을 넘겨도 아래 글자가 움직이지 않는다.
 * 사진은 자르지 않고 칸 안에 사진 비율대로 가운데 두며, 빈 곳은 앱 배경이 보이고 모서리는 보이는 사진에 준다.
 * 사진을 받는 동안과 받지 못했을 때는 불러오는 동안의 뼈대(`RecordDetailSkeleton`)와 같은 회색 칸을 둔다.
 *
 * @example <DetailPhotoFrame url={photo.url} alt="성수 데이트 사진 1" loading="eager" />
 */
export const DetailPhotoFrame = ({ url, alt, loading }: DetailPhotoFrameProps): ReactElement => {
  const [loaded, setLoaded] = useState<LoadedPhoto>();
  // 주소가 바뀌면(새로 서명) 그 주소를 다 받을 때까지 다시 회색 칸으로 둔다
  const shown = url !== undefined && loaded?.url === url ? loaded : undefined;

  const handleLoaded = (image: HTMLImageElement) => {
    if (url === undefined) return;
    setLoaded({ url, isWiderThanFrame: image.naturalWidth / image.naturalHeight > FRAME_RATIO });
  };

  return (
    <div className={`relative aspect-[4/5] rounded-[16px] ${shown ? "" : "bg-surface"}`}>
      {url && (
        <SignedPhoto
          src={url}
          alt={alt}
          loading={loading}
          draggable={false}
          onLoaded={handleLoaded}
          // 다 받으면 한쪽 길이만 칸에 맞추고 다른 쪽은 사진 비율대로 둬, 칸보다 작은 사진도 칸에 맞게 키운다. 사방 0 + 바깥 여백 auto로 가운데 둔다.
          // 받기 전에는 크기를 몰라 칸을 채운 채 숨겨, 깨진 사진 표시도 보이지 않는다.
          // 넘기는 동안 움직이는 줄 안에서 자르기(overflow-hidden)가 풀리는 WebKit 문제를 피해 사진에 직접 모서리를 준다(#321)
          className={`absolute inset-0 ${shown ? `m-auto rounded-[16px] ${shown.isWiderThanFrame ? "w-full" : "h-full"}` : "size-full opacity-0"}`}
        />
      )}
    </div>
  );
};
