import { useEffect, useState } from "react";

/** 파일로 만든 사진 미리보기 주소 묶음 */
interface PreviewUrls {
  /** 파일로 미리보기 주소를 만들고 기억한다 */
  create: (file: File) => string;
  /** 만든 미리보기면 해제한다. 저장된 사진의 서명 주소처럼 만든 적 없는 주소는 건드리지 않는다 */
  revoke: (url: string | undefined) => void;
  /** 기억한 미리보기를 모두 해제한다 */
  revokeAll: () => void;
}

/**
 * 미리보기 주소(`blob:`)는 해제할 때까지 브라우저 메모리에 파일을 붙잡으므로, 만든 것만 골라 해제한다.
 *
 * @example
 * const previews = createPreviewUrls();
 * const url = previews.create(file);
 * previews.revoke(url);
 */
export const createPreviewUrls = (): PreviewUrls => {
  const urls = new Set<string>();
  return {
    create: (file) => {
      const url = URL.createObjectURL(file);
      urls.add(url);
      return url;
    },
    revoke: (url) => {
      if (!url || !urls.has(url)) return;
      URL.revokeObjectURL(url);
      urls.delete(url);
    },
    revokeAll: () => {
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    },
  };
};

/**
 * 화면에서 쓰는 미리보기 주소 묶음. 화면을 떠나면 남은 미리보기를 모두 해제한다(브라우저 메모리 = 외부 자원).
 *
 * @example
 * const previews = usePreviewUrls();
 * const url = previews.create(file);
 */
export const usePreviewUrls = (): PreviewUrls => {
  // 처음 그릴 때 한 번만 만든다. 다시 그릴 때마다 새로 만들면 앞서 만든 주소를 잊는다
  const [previews] = useState(createPreviewUrls);
  useEffect(() => previews.revokeAll, [previews]);
  return previews;
};
