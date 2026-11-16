// 사진 고르기에서 형식만 거르는 작은 모듈. 줄이기 라이브러리(resize.ts)를 불러오지 않아,
// 사진을 고르기 전 화면(홈 커플 사진 등)의 첫 코드에 라이브러리가 들어가지 않는다(#344). 여기에는 import를 두지 않는다

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
/** HEIC·HEIF 확장자. 변환한 JPEG의 파일 이름을 바꿀 때도 쓴다 */
export const HEIC_EXTENSION = /\.(heic|heif)$/i;

// SVG는 크기 정보가 없을 수 있고 GIF는 첫 장면만 남아, 사진으로 받는 형식만 허용한다
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_EXTENSION = /\.(jpe?g|png|webp)$/i;

// 일부 파일 선택기는 MIME 타입을 비우거나 일반 바이너리로 넘겨, 그때는 확장자로 판단한다
const hasUnknownType = (file: File): boolean => file.type === "" || file.type === "application/octet-stream";

/**
 * HEIC·HEIF 사진인지 확인한다. MIME 타입이 비었거나 일반 바이너리면 확장자로 본다.
 *
 * @example isHeic(new File([], "IMG_0001.HEIC")) // true
 */
export const isHeic = (file: File): boolean =>
  HEIC_TYPES.has(file.type) || (hasUnknownType(file) && HEIC_EXTENSION.test(file.name));

const isSupportedPhoto = (file: File): boolean =>
  PHOTO_TYPES.has(file.type) || (hasUnknownType(file) && PHOTO_EXTENSION.test(file.name));

/** 사진 고르기 `<input type="file">`의 `accept`. `isAcceptedPhoto`가 받는 형식과 같다 */
export const PHOTO_INPUT_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";

/**
 * 올릴 수 있는 사진인지 확인한다(JPEG·PNG·WebP·HEIC). 사진을 고를 때 걸러 저장 단계에서 실패하지 않게 한다.
 *
 * @example isAcceptedPhoto(new File([], "a.gif", { type: "image/gif" })) // false
 */
export const isAcceptedPhoto = (file: File): boolean => isHeic(file) || isSupportedPhoto(file);
