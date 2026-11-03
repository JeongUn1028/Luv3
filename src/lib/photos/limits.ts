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

/**
 * 서명 URL 유효 시간(초). 화면은 요청마다 새로 그리고 한 번 불러온 사진은 브라우저가 들고 있으므로,
 * 화면을 오래 열어 둘 만큼만 두고 주소가 밖으로 새어도 오래 쓰이지 않게 한다
 */
export const SIGNED_URL_EXPIRES_IN = 60 * 60;
