const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  for (const id of [dateId, photoId]) {
    if (!UUID_PATTERN.test(id)) throw new Error(`사진 경로의 id는 UUID여야 합니다: ${id}`);
  }

  return {
    path: `${dateId}/${photoId}.jpg`,
    thumbPath: `${dateId}/${photoId}_thumb.jpg`,
  };
};
