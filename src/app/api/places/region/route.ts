import { getCurrentMember } from "@/lib/auth/member";
import { findAdmdongName } from "@/lib/places/admdong";
import { loadAdmdongBoundaries } from "@/lib/places/admdong-server";
import { NO_STORE_HEADERS, toErrorResponse } from "@/lib/api-response";

// 화면은 숫자를 그대로 넘긴다. Number가 받아 주는 빈 글자(0)·16진수·지수 표기는 잘못된 좌표로 본다
const DECIMAL = /^-?\d+(\.\d+)?$/;

const toCoordinate = (text: string | null, limit: number): number | undefined => {
  if (text === null || !DECIMAL.test(text)) return undefined;
  const value = Number(text);
  return Math.abs(value) <= limit ? value : undefined;
};

/**
 * 사진 좌표(EXIF GPS)에 붙일 동네 이름(행정동 "구 + 동"). 카카오 결과는 저장할 수 없어(약관) 서버에 둔 행정동 경계로 계산한다(#249).
 * 경계 파일을 휴대폰에 보내지 않으려고 서버에서 계산하고, 멤버만 받는다(아니면 로그인 화면으로 보낸다). 경계 밖(해외·바다)이면 `{ name: null }`.
 */
export const GET = async (request: Request): Promise<Response> => {
  await getCurrentMember();

  const params = new URL(request.url).searchParams;
  const lat = toCoordinate(params.get("lat"), 90);
  const lng = toCoordinate(params.get("lng"), 180);
  if (lat === undefined || lng === undefined) {
    return toErrorResponse("INVALID_LOCATION", "좌표가 잘못됐어요.", 400);
  }

  // 경계 파일을 읽지 못하면 빌드가 잘못된 것이라 전역 오류 처리로 넘긴다. 화면은 실패하면 "찍은 곳"으로 둔다
  const name = findAdmdongName(await loadAdmdongBoundaries(), { lat, lng });
  return Response.json({ name: name ?? null }, { headers: NO_STORE_HEADERS });
};
