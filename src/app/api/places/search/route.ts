import { getCurrentMember } from "@/lib/auth/member";
import { PLACE_MAX_LENGTH } from "@/lib/dates/form";
import { countChars } from "@/lib/form";
import { toLoggedCause } from "@/lib/load";
import { PlaceSearchError, searchKakaoPlaces } from "@/lib/places/search";

const NO_STORE = { "Cache-Control": "no-store" };

const toErrorResponse = (code: string, message: string, status: number): Response =>
  Response.json({ code, message }, { status, headers: NO_STORE });

/**
 * 기록 폼의 장소 찾기. REST 키를 브라우저에 보내지 않으려고 서버에서 카카오를 부른다.
 * 무료 한도를 남이 쓰지 못하게 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 */
export const GET = async (request: Request): Promise<Response> => {
  await getCurrentMember();

  const apiKey = process.env.KAKAO_REST_API_KEY;
  if (!apiKey) return toErrorResponse("PLACE_SEARCH_OFF", "장소 찾기를 쓸 수 없어요.", 503);

  const query = new URL(request.url).searchParams.get("q")?.trim();
  if (!query || countChars(query) > PLACE_MAX_LENGTH) return toErrorResponse("INVALID_QUERY", "찾을 장소를 다시 적어 주세요.", 400);

  try {
    const items = await searchKakaoPlaces({ query, apiKey });
    return Response.json({ items }, { headers: NO_STORE });
  } catch (error) {
    if (!(error instanceof PlaceSearchError)) throw error;
    // 검색어는 어디에 갔는지 드러나므로 로그에 남기지 않는다
    console.error("장소 찾기 실패", { status: error.status, ...toLoggedCause(error.cause) });
    const isOverLimit = error.status === 429;
    return toErrorResponse(isOverLimit ? "PLACE_SEARCH_LIMIT" : "PLACE_SEARCH_FAILED", error.message, isOverLimit ? 429 : 502);
  }
};
