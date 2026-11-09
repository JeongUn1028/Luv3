import imageCompression, { type Options } from "browser-image-compression";
import { PhotoError } from "./errors";
import { BUCKET_FILE_SIZE_LIMIT, MEDIUM_MAX_EDGE, ORIGINAL_MAX_EDGE, THUMB_MAX_EDGE, UPLOAD_CONTENT_TYPE } from "./limits";

// 기본값인 웹 워커는 jsdelivr CDN에서 스크립트를 받아 와, CDN이 막히거나 느리면 업로드가 멈춘다.
// 메인 스레드에서 한 장씩 처리해도 휴대폰에서 한 장에 1초 안팎이라 끈다.
// 라이브러리는 결과가 원래 파일보다 크면 화질을 0.95배씩 최대 10번 낮춰, 이미 압축된 작은 사진이 뭉개진다.
// 다시 낮추는 횟수를 한 번으로 묶는다(최저 화질 = initialQuality × 0.95).
// preserveExif는 기본값(false)을 둬 위치 정보(GPS) 같은 EXIF를 지운다.
const BASE_OPTIONS = {
  fileType: UPLOAD_CONTENT_TYPE,
  useWebWorker: false,
  maxIteration: 1,
} as const satisfies Options;

const ORIGINAL_OPTIONS = {
  ...BASE_OPTIONS,
  maxWidthOrHeight: ORIGINAL_MAX_EDGE,
  initialQuality: 0.85,
} as const satisfies Options;

const THUMB_OPTIONS = {
  ...BASE_OPTIONS,
  maxWidthOrHeight: THUMB_MAX_EDGE,
  initialQuality: 0.8,
} as const satisfies Options;

const MEDIUM_OPTIONS = {
  ...BASE_OPTIONS,
  maxWidthOrHeight: MEDIUM_MAX_EDGE,
  initialQuality: 0.85,
} as const satisfies Options;

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);
const HEIC_EXTENSION = /\.(heic|heif)$/i;

// SVG는 크기 정보가 없을 수 있고 GIF는 첫 장면만 남아, 사진으로 받는 형식만 허용한다
const PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const PHOTO_EXTENSION = /\.(jpe?g|png|webp)$/i;

// 일부 파일 선택기는 MIME 타입을 비우거나 일반 바이너리로 넘겨, 그때는 확장자로 판단한다
const hasUnknownType = (file: File): boolean => file.type === "" || file.type === "application/octet-stream";

export interface ResizedPhoto {
  /** 긴 변 2000px JPEG(상세 화면용) */
  original: Blob;
  /** 긴 변 600px JPEG(앨범 그리드용) */
  thumb: Blob;
}

export interface ResizedCouplePhoto {
  /** 긴 변 2000px JPEG(원본 보관용) */
  original: Blob;
  /** 긴 변 1100px JPEG(홈 커플 사진 카드용) */
  medium: Blob;
}

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

// heic2any는 libheif를 품고 있어 크고(약 2.7MB), 불러올 때 window가 필요하다. HEIC를 고른 경우에만 불러온다.
const convertHeicToJpeg = async (file: File): Promise<File> => {
  try {
    const { default: heic2any } = await import("heic2any");
    const converted = await heic2any({ blob: file, toType: UPLOAD_CONTENT_TYPE, quality: 0.92 });
    // 라이브 포토처럼 여러 장이 든 HEIC는 첫 장을 쓴다
    const first = Array.isArray(converted) ? converted[0] : converted;
    return new File([first], file.name.replace(HEIC_EXTENSION, ".jpg"), { type: UPLOAD_CONTENT_TYPE });
  } catch (error) {
    throw new PhotoError("decode-failed", { cause: error });
  }
};

// 라이브러리 타입은 File을 돌려준다고 하지만, Chrome(OffscreenCanvas)에서는 name만 붙인 Blob이 온다
const compress = async (file: File, options: Options): Promise<File> => {
  try {
    return await imageCompression(file, options);
  } catch (error) {
    throw new PhotoError("decode-failed", { cause: error });
  }
};

// 작은 사본은 원본용보다 클 수 없어 버킷 제한은 원본용만 확인한다
const resizeOriginal = async (file: File): Promise<File> => {
  if (!isAcceptedPhoto(file)) throw new PhotoError("unsupported-type");

  const source = isHeic(file) ? await convertHeicToJpeg(file) : file;
  const original = await compress(source, ORIGINAL_OPTIONS);
  if (original.size > BUCKET_FILE_SIZE_LIMIT) throw new PhotoError("too-large");
  return original;
};

/**
 * 고른 사진을 원본용(긴 변 2000px)·썸네일(긴 변 600px) JPEG 두 벌로 줄인다. 브라우저에서만 쓴다.
 * JPEG·PNG·WebP·HEIC를 받고, HEIC는 먼저 JPEG로 바꾼다. 원래 사진이 기준보다 작으면 키우지 않는다.
 *
 * @throws {PhotoError} 받지 않는 형식이거나(`unsupported-type`) 읽지 못했거나(`decode-failed`) 버킷 제한을 넘으면(`too-large`)
 * @example
 * const { original, thumb } = await resizePhoto(input.files[0])
 */
export const resizePhoto = async (file: File): Promise<ResizedPhoto> => {
  const original = await resizeOriginal(file);
  // 수천만 화소 원본을 다시 읽는 것보다 이미 줄인 원본용에서 만드는 편이 빠르다
  const thumb = await compress(original, THUMB_OPTIONS);

  return { original, thumb };
};

/**
 * 고른 커플 사진을 원본용(긴 변 2000px)·홈 카드용(긴 변 1100px) JPEG 두 벌로 줄인다. 브라우저에서만 쓴다.
 * 받는 형식과 HEIC 변환, 키우지 않는 것은 `resizePhoto`와 같다.
 *
 * @throws {PhotoError} 받지 않는 형식이거나(`unsupported-type`) 읽지 못했거나(`decode-failed`) 버킷 제한을 넘으면(`too-large`)
 * @example
 * const { original, medium } = await resizeCouplePhoto(input.files[0])
 */
export const resizeCouplePhoto = async (file: File): Promise<ResizedCouplePhoto> => {
  const original = await resizeOriginal(file);
  const medium = await compress(original, MEDIUM_OPTIONS);

  return { original, medium };
};
