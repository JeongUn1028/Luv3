/** 사진을 휴대폰에 넘기는 방법. 브라우저의 `navigator`와 내려받기 링크를 이 모양으로 넘긴다 */
export interface SaveTarget {
  /** `navigator.canShare`. 없는 브라우저도 있다 */
  canShare: ((data: ShareData) => boolean) | undefined;
  /** `navigator.share`. 없는 브라우저도 있다 */
  share: ((data: ShareData) => Promise<void>) | undefined;
  /** 파일을 내려받게 한다(`<a download>`) */
  download: (file: File) => void;
}

/** 저장 결과. 공유 창은 저장 여부를 알려 주지 않아 연 것까지만 안다 */
export type SaveOutcome = "shared" | "downloaded" | "cancelled";

const isDomError = (error: unknown, name: string): boolean => error instanceof DOMException && error.name === name;

/**
 * 사진을 휴대폰에 저장하게 한다. 아이폰은 내려받은 파일이 사진 앱이 아닌 파일 앱으로 가므로,
 * 파일 공유를 지원하면 공유 창("이미지 저장")을 먼저 열고, 지원하지 않거나 브라우저가 막으면 내려받는다.
 *
 * @throws 공유 창이 닫기·막힘이 아닌 이유로 실패했을 때
 * @example await savePhotoToDevice(file, { canShare: navigator.canShare?.bind(navigator), share: navigator.share?.bind(navigator), download })
 */
export const savePhotoToDevice = async (file: File, { canShare, share, download }: SaveTarget): Promise<SaveOutcome> => {
  const data: ShareData = { files: [file] };
  if (share && canShare?.(data)) {
    try {
      await share(data);
      return "shared";
    } catch (error) {
      if (isDomError(error, "AbortError")) return "cancelled";
      // 누른 뒤 시간이 오래 지나는 등으로 공유를 허락하지 않으면 내려받기라도 한다
      if (!isDomError(error, "NotAllowedError")) throw error;
    }
  }
  download(file);
  return "downloaded";
};

/** 사진을 받지 못했을 때 */
export class PhotoFileLoadError extends Error {
  constructor(options?: ErrorOptions) {
    super("사진을 받지 못했어요. 다시 시도해 주세요.", options);
    this.name = "PhotoFileLoadError";
  }
}

interface FetchPhotoFileParams {
  /** 원본 서명 주소 */
  url: string;
  fileName: string;
  /** 테스트에서만 바꾼다 */
  fetchPhoto?: (url: string) => Promise<Response>;
}

/**
 * 서명 주소의 사진을 저장할 파일로 받는다. 공유 창은 누른 순간에 열어야 해서, 화면을 열 때 미리 받아 둔다.
 *
 * @throws {PhotoFileLoadError} 받지 못했을 때(만료된 주소, 끊긴 연결)
 * @example const file = await fetchPhotoFile({ url: photo.url, fileName: photo.fileName })
 */
export const fetchPhotoFile = async ({ url, fileName, fetchPhoto = (photoUrl) => fetch(photoUrl) }: FetchPhotoFileParams): Promise<File> => {
  const response = await fetchPhoto(url).catch((cause: unknown) => {
    throw new PhotoFileLoadError({ cause });
  });
  if (!response.ok) throw new PhotoFileLoadError({ cause: new Error(`HTTP ${response.status}`) });
  const blob = await response.blob();
  return new File([blob], fileName, { type: blob.type || "image/jpeg" });
};
