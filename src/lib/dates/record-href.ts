/** 기록 상세에서 처음 펼칠 사진을 고르는 주소 이름(`/dates/<id>?photo=<사진 id>`) */
export const RECORD_PHOTO_PARAM = "photo";

/**
 * 기록 상세 주소.
 *
 * @example toRecordHref("r1") // "/dates/r1"
 */
export const toRecordHref = (recordId: string): string => `/dates/${recordId}`;

/**
 * 기록 고치기 주소.
 *
 * @example toRecordEditHref("r1") // "/dates/r1/edit"
 */
export const toRecordEditHref = (recordId: string): string => `${toRecordHref(recordId)}/edit`;

/**
 * 그 사진부터 펼치는 기록 상세 주소. 지도의 사진 줄에서 고른 사진으로 갈 때 쓴다.
 *
 * @example toRecordPhotoHref({ recordId: "r1", photoId: "p2" }) // "/dates/r1?photo=p2"
 */
export const toRecordPhotoHref = ({ recordId, photoId }: { recordId: string; photoId: string }): string =>
  `${toRecordHref(recordId)}?${new URLSearchParams({ [RECORD_PHOTO_PARAM]: photoId }).toString()}`;
