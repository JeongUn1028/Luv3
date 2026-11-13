import type { ReactElement, SyntheticEvent } from "react";

interface PickedPhotoProps {
  /** 기기 안의 사진 주소(`URL.createObjectURL`) */
  url: string;
  alt: string;
  /** 브라우저가 그리지 못하면(Chrome의 HEIC 등) 불린다 */
  onError: (event: SyntheticEvent<HTMLImageElement>) => void;
  className?: string;
}

/**
 * 저장을 기다리지 않고 먼저 보여 주는, 방금 고른 사진(#329). 서버 사진(서명 주소)은 `RememberedPhoto`·`SignedPhoto`로 그린다.
 *
 * @example <PickedPhoto url={previewUrl} alt="커플 사진" onError={handlePreviewError} className="absolute inset-0 size-full object-cover" />
 */
export const PickedPhoto = ({ url, alt, onError, className }: PickedPhotoProps): ReactElement => (
  // eslint-disable-next-line @next/next/no-img-element -- 기기 안의 사진(blob:)이라 next/image가 최적화할 수 없다
  <img src={url} alt={alt} onError={onError} className={className} />
);
