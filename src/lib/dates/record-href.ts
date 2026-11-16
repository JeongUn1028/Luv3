/** 기록 상세에서 처음 펼칠 사진을 고르는 주소 이름(`/dates/<id>?photo=<사진 id>`) */
export const RECORD_PHOTO_PARAM = "photo";

/**
 * 기록 상세 주소.
 *
 * @example toRecordHref("r1") // "/dates/r1"
 */
export const toRecordHref = (recordId: string): string => `/dates/${recordId}`;

/**
 * 그 사진부터 펼치는 기록 상세 주소. 지도의 사진 줄에서 고른 사진으로 갈 때 쓴다.
 *
 * @example toRecordPhotoHref({ recordId: "r1", photoId: "p2" }) // "/dates/r1?photo=p2"
 */
export const toRecordPhotoHref = ({ recordId, photoId }: { recordId: string; photoId: string }): string =>
  `${toRecordHref(recordId)}?${new URLSearchParams({ [RECORD_PHOTO_PARAM]: photoId }).toString()}`;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * 주소의 기록 id가 UUID 형식인지 확인한다. 형식이 틀리면 DB에 묻지 않고 바로 "없는 기록"으로 처리한다
 * (uuid 컬럼에 다른 문자열을 넘기면 DB가 22P02 에러를 낸다).
 *
 * @example isRecordId("5a87e560-6a6e-49be-8af3-db196468143c") // true
 */
export const isRecordId = (id: string): boolean => UUID_PATTERN.test(id);
