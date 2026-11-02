/**
 * 사진 처리가 실패한 이유.
 * - `unsupported-type`: 사진 파일이 아니다
 * - `decode-failed`: 브라우저가 사진을 읽지 못했다(깨진 파일, HEIC 변환 실패 등)
 * - `too-large`: 줄인 결과가 버킷 용량 제한을 넘는다
 * - `upload-failed`: 다시 시도해도 업로드하지 못했다
 */
export type PhotoErrorReason = "unsupported-type" | "decode-failed" | "too-large" | "upload-failed";

const MESSAGES = {
  "unsupported-type": "사진 파일만 올릴 수 있어요.",
  "decode-failed": "사진을 열 수 없어요. 다른 사진을 골라 주세요.",
  "too-large": "사진이 너무 커서 올릴 수 없어요.",
  "upload-failed": "사진을 올리지 못했어요. 잠시 후 다시 시도해 주세요.",
} as const satisfies Record<PhotoErrorReason, string>;

/**
 * 사진 리사이즈·업로드 에러. `message`는 화면에 그대로 보여 줄 수 있는 문구다.
 *
 * @example
 * try { await resizePhoto(file) } catch (error) {
 *   if (error instanceof PhotoError) showToast(error.message)
 * }
 */
export class PhotoError extends Error {
  readonly reason: PhotoErrorReason;

  constructor(reason: PhotoErrorReason, options?: ErrorOptions) {
    super(MESSAGES[reason], options);
    this.name = "PhotoError";
    this.reason = reason;
  }
}
