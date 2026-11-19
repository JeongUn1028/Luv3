// 사진 고르기에서 형식만 거르는 작은 모듈. 줄이기 라이브러리(resize.ts)를 불러오지 않아,
// 사진을 고르기 전 화면(홈 커플 사진 등)의 첫 코드에 라이브러리가 들어가지 않는다(#344). 여기에는 import를 두지 않는다

// 받는 형식을 이 표 하나에 두고, 받는 MIME 타입·확장자, 사진 고르기 칸의 accept, 안내 문구의 형식 이름을 모두 여기서 만든다.
// SVG는 크기 정보가 없을 수 있고 GIF는 첫 장면만 남아, 사진으로 받는 형식만 둔다.
// HEIC는 JPEG로 바꿔 받는다. 여러 장이 든 HEIC(-sequence)도 받지만, 사진 고르기 칸에는 기본 두 타입만 알린다
const PHOTO_FORMATS = [
  { name: "JPEG", types: ["image/jpeg"], acceptTypes: ["image/jpeg"], extensions: ["jpg", "jpeg"], isHeic: false },
  { name: "PNG", types: ["image/png"], acceptTypes: ["image/png"], extensions: ["png"], isHeic: false },
  { name: "WebP", types: ["image/webp"], acceptTypes: ["image/webp"], extensions: ["webp"], isHeic: false },
  {
    name: "HEIC",
    types: ["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"],
    acceptTypes: ["image/heic", "image/heif"],
    extensions: ["heic", "heif"],
    isHeic: true,
  },
] as const;

const HEIC_FORMATS = PHOTO_FORMATS.filter((format) => format.isHeic);
const OTHER_FORMATS = PHOTO_FORMATS.filter((format) => !format.isHeic);

const toExtensionPattern = (extensions: readonly string[]): RegExp => new RegExp(`\.(${extensions.join("|")})$`, "i");

const HEIC_TYPES = new Set<string>(HEIC_FORMATS.flatMap((format) => format.types));
const HEIC_EXTENSIONS = HEIC_FORMATS.flatMap((format) => format.extensions);
/** HEIC·HEIF 확장자. 변환한 JPEG의 파일 이름을 바꿀 때도 쓴다 */
export const HEIC_EXTENSION = toExtensionPattern(HEIC_EXTENSIONS);

const PHOTO_TYPES = new Set<string>(OTHER_FORMATS.flatMap((format) => format.types));
const PHOTO_EXTENSION = toExtensionPattern(OTHER_FORMATS.flatMap((format) => format.extensions));

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

/**
 * 사진 고르기 `<input type="file">`의 `accept`. `isAcceptedPhoto`가 받는 형식과 같다.
 * HEIC는 확장자도 알린다. 아이폰은 HEIC를 받는다고 알리지 않는 칸에 사진을 JPEG로 바꿔 넘기며 위치 정보를 지운다(#249).
 *
 * @example <input type="file" accept={PHOTO_INPUT_ACCEPT} />
 */
export const PHOTO_INPUT_ACCEPT = [
  ...PHOTO_FORMATS.flatMap((format) => format.acceptTypes),
  ...HEIC_EXTENSIONS.map((extension) => `.${extension}`),
].join(",");

/**
 * 올릴 수 있는 사진 형식 이름을 안내 문구에 쓸 모양으로 이은 것.
 *
 * @example `${ACCEPTED_PHOTO_FORMATS_LABEL} 사진만 올릴 수 있어요` // "JPEG·PNG·WebP·HEIC 사진만 올릴 수 있어요"
 */
export const ACCEPTED_PHOTO_FORMATS_LABEL = PHOTO_FORMATS.map((format) => format.name).join("·");

/**
 * 올릴 수 있는 사진인지 확인한다(받는 형식은 `ACCEPTED_PHOTO_FORMATS_LABEL`). 사진을 고를 때 걸러 저장 단계에서 실패하지 않게 한다.
 *
 * @example isAcceptedPhoto(new File([], "a.gif", { type: "image/gif" })) // false
 */
export const isAcceptedPhoto = (file: File): boolean => isHeic(file) || isSupportedPhoto(file);
