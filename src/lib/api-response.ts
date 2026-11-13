// API 경로(src/app/api)가 함께 쓰는 응답 도우미

/** 응답 머리. 두 사람만의 내용이나 그때그때 다른 결과라 브라우저·CDN이 저장해 두지 않게 한다. 모든 경로가 함께 쓰므로 바꿀 수 없게 얼린다 */
export const NO_STORE_HEADERS = Object.freeze({ "Cache-Control": "no-store" });

/**
 * 오류 응답을 `{ code, message }` 모양으로 만든다. 저장해 두지 않게 한다.
 *
 * @example return toErrorResponse("INVALID_QUERY", "찾을 내용을 다시 적어 주세요.", 400);
 */
export const toErrorResponse = (code: string, message: string, status: number): Response =>
  Response.json({ code, message }, { status, headers: NO_STORE_HEADERS });
