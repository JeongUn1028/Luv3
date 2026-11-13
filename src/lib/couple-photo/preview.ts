/** 저장을 기다리지 않고 먼저 보여 주는, 새로 고른 커플 사진(#329) */
export interface CouplePhotoPreview {
  /** 이 사진을 저장할 id(`replaceCouplePhoto`의 `photoId`) */
  photoId: string;
  /**
   * 그릴 사진 주소(`URL.createObjectURL`). 고른 파일을 브라우저가 그리지 못해(Chrome의 HEIC 등)
   * 줄이기·변환이 끝난 사진을 기다리는 동안은 undefined
   */
  url: string | undefined;
  /** 고를 때 보이던 서버 사진의 경로. 처음 추가하면 undefined */
  replacedPath: string | undefined;
}

/** 커플 사진 자리에 그릴 것. `preview`는 고른 사진, `photo`는 서버가 준 사진, `empty`는 추가 칸 */
export type CouplePhotoView = { kind: "preview"; url: string } | { kind: "photo" } | { kind: "empty" };

export interface ToCouplePhotoViewParams {
  /** 서버가 준 커플 사진의 경로. 없으면 undefined */
  photoPath: string | undefined;
  preview: CouplePhotoPreview | undefined;
  /** 지우기를 누른 사진의 경로. 서버가 이 사진을 계속 주는 동안에도 지운 것으로 보여 준다 */
  clearingPath: string | undefined;
}

/**
 * 커플 사진 자리에 무엇을 그릴지 정한다. 고른 사진을 그릴 수 있으면 그것을, 지우는 중인 사진이면 추가 칸을 먼저 보여 준다.
 *
 * @example toCouplePhotoView({ photoPath: "couple/a_medium.jpg", preview: undefined, clearingPath: "couple/a_medium.jpg" }) // { kind: "empty" }
 */
export const toCouplePhotoView = ({ photoPath, preview, clearingPath }: ToCouplePhotoViewParams): CouplePhotoView => {
  if (preview?.url !== undefined) return { kind: "preview", url: preview.url };
  if (photoPath === undefined || photoPath === clearingPath) return { kind: "empty" };
  return { kind: "photo" };
};

/**
 * 서버 사진을 다 받아 그렸을 때 미리 보여 준 사진을 치울지 정한다. 고를 때 보이던 사진과 다른 사진이면 저장이 끝나 새로 받은 것이다.
 * 저장하는 사이 상대가 다른 사진으로 바꿨어도 그 사진이 지금 커플 사진이라 치운다(내 사진을 계속 덮어 두지 않는다).
 *
 * @param loadedPath 다 받아 그린 서버 사진의 경로
 * @example shouldHidePreview({ photoId, url, replacedPath: "couple/old_medium.jpg" }, `couple/${photoId}_medium.jpg`) // true
 */
export const shouldHidePreview = (preview: CouplePhotoPreview | undefined, loadedPath: string | undefined): boolean =>
  preview !== undefined && loadedPath !== undefined && loadedPath !== preview.replacedPath;
