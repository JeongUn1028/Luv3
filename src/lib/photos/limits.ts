/** 사진을 올리는 private 버킷 */
export const ALBUM_BUCKET = "album";

/** album 버킷이 받는 한 파일의 최대 크기(5MB). 초기 마이그레이션의 버킷 설정과 같아야 한다 */
export const BUCKET_FILE_SIZE_LIMIT = 5 * 1024 * 1024;

/** 원본·썸네일 모두 JPEG로 올린다. 버킷은 JPEG·WebP만 받는다 */
export const UPLOAD_CONTENT_TYPE = "image/jpeg";

/** 상세 화면용 원본의 긴 변(px) */
export const ORIGINAL_MAX_EDGE = 2000;

/** 앨범 그리드용 썸네일의 긴 변(px) */
export const THUMB_MAX_EDGE = 600;

/** 홈 커플 사진 카드용 중간 크기의 긴 변(px). 카드 폭(약 360px) × 화면 배율 3에 맞춘다 */
export const MEDIUM_MAX_EDGE = 1100;

/**
 * 올린 사진을 휴대폰과 저장소 CDN이 저장해 둘 시간(초, 7일). 사진 파일은 덮어쓰지 않아 같은 경로면 늘 같은 사진이다.
 * CDN은 파일을 지우거나 주소가 만료돼도 이 시간 동안 저장한 사본을 보내 주므로, 홈 사진 주소를 다시 쓰는 가장 긴 기간(#219)만큼만 둔다
 */
export const PHOTO_CACHE_CONTROL = String(7 * 24 * 60 * 60);

/**
 * 서명 URL 유효 시간(초). 화면을 오래 열어 둘 시간과 주소를 다시 쓸 시간을 더한 만큼만 두고,
 * 주소가 밖으로 새어도 오래 쓰이지 않게 한다
 */
export const SIGNED_URL_EXPIRES_IN = 2 * 60 * 60;

/**
 * 보관한 서명 URL을 다시 쓸 때 남아 있어야 하는 유효 시간(초). 화면에 받은 주소는 그 뒤로 이 시간만큼은 쓸 수 있어,
 * 아직 받지 않은 사진이 화면을 연 채로 깨지지 않게 한다. 유효 시간에서 이 값을 뺀 시간(1시간) 동안 같은 주소를 다시 쓴다
 */
export const SIGNED_URL_MIN_REMAINING = 60 * 60;
