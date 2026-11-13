/**
 * 사진 줄이기 웹 워커가 불러올 browser-image-compression 사본의 주소(`public/` 기준).
 * 라이브러리 기본값은 jsdelivr CDN이라 CSP에 막히고 CDN이 느리면 저장도 느려져, 같은 버전 파일을 우리 주소에 둔다(#312).
 * 버전을 올리면 `compression-lib.test.ts`가 실패하므로 `node_modules/browser-image-compression/dist/browser-image-compression.js`를
 * 새 버전 이름으로 복사하고 이 값을 바꾼다
 */
export const IMAGE_COMPRESSION_LIB_PATH = "/vendor/browser-image-compression-2.0.2.js";

/**
 * 웹 워커에 넘길 라이브러리 사본의 전체 주소를 만든다. 워커는 `blob:` 주소에서 돌아 `/vendor/...` 같은 상대 주소를 풀지 못한다.
 *
 * @example toImageCompressionLibUrl("https://luv3.app") // "https://luv3.app/vendor/browser-image-compression-2.0.2.js"
 */
export const toImageCompressionLibUrl = (origin: string): string => new URL(IMAGE_COMPRESSION_LIB_PATH, origin).href;
