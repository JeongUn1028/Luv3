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
