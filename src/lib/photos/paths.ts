const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// id가 경로에 그대로 들어가므로, UUID가 아니면 다른 폴더(../)에 파일이 생길 수 있다
const assertUuid = (id: string): void => {
  if (!UUID_PATTERN.test(id)) throw new Error(`사진 경로의 id는 UUID여야 합니다: ${id}`);
};

export interface PhotoPaths {
  /** 원본용 경로 `{date_id}/{photo_id}.jpg` */
  path: string;
  /** 썸네일 경로 `{date_id}/{photo_id}_thumb.jpg` */
  thumbPath: string;
}

/**
 * album 버킷 안의 원본·썸네일 경로를 만든다. 경로에는 버킷 이름을 넣지 않는다(docs/plan.md "데이터 구조").
 *
 * @example buildPhotoPaths(dateId, photoId) // { path: "<dateId>/<photoId>.jpg", thumbPath: "<dateId>/<photoId>_thumb.jpg" }
 */
export const buildPhotoPaths = (dateId: string, photoId: string): PhotoPaths => {
  assertUuid(dateId);
  assertUuid(photoId);

  return {
    path: `${dateId}/${photoId}.jpg`,
    thumbPath: `${dateId}/${photoId}_thumb.jpg`,
  };
};

/**
 * album 버킷 안의 커플 사진 경로를 만든다. 기록 폴더(`{date_id}/`)와 겹치지 않게 `couple/` 폴더에 둔다.
 * 홈에 크게 보여 주는 한 장이라 원본만 올리고 썸네일은 두지 않는다.
 *
 * @example buildCouplePhotoPath(photoId) // "couple/<photoId>.jpg"
 */
export const buildCouplePhotoPath = (photoId: string): string => {
  assertUuid(photoId);
  // DB의 경로 검사는 소문자 UUID만 받는다
  return `couple/${photoId.toLowerCase()}.jpg`;
};

/**
 * 커플 사진 원본 경로 옆에 두는 홈 카드용 중간 크기 경로를 만든다. DB에는 원본 경로만 저장하고 이 경로는 원본에서 정한다.
 *
 * @example toCouplePhotoMediumPath("couple/<photoId>.jpg") // "couple/<photoId>_medium.jpg"
 */
export const toCouplePhotoMediumPath = (path: string): string => {
  // .jpg로 끝나지 않으면 중간 크기 경로가 원본 경로와 같아져, 원본을 덮어쓰거나 지울 수 있다
  if (!path.endsWith(".jpg")) throw new Error(`커플 사진 경로는 .jpg로 끝나야 합니다: ${path}`);
  return `${path.slice(0, -".jpg".length)}_medium.jpg`;
};
