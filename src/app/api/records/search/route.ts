import { getCurrentMember } from "@/lib/auth/member";
import { parseRecordSearchParams } from "@/lib/dates/search-api";
import { RecordSearchLoadError, searchRecords } from "@/lib/dates/search-queries";
import { catchLoadError } from "@/lib/load";

const NO_STORE = { "Cache-Control": "no-store" };

const toErrorResponse = (code: string, message: string, status: number): Response =>
  Response.json({ code, message }, { status, headers: NO_STORE });

/**
 * 기록 탭 찾기(#273). 검색어·태그에 맞는 기록을 한 묶음씩 돌려준다.
 * 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 */
export const GET = async (request: Request): Promise<Response> => {
  await getCurrentMember();

  const params = parseRecordSearchParams(new URL(request.url).searchParams);
  if (!params) return toErrorResponse("INVALID_QUERY", "찾을 내용을 다시 적어 주세요.", 400);

  // 실패 원인만 로그에 남는다. 검색어는 둘만의 기록 내용이 드러나므로 남기지 않는다
  const page = await catchLoadError(() => searchRecords(params), RecordSearchLoadError);
  if (page instanceof RecordSearchLoadError) return toErrorResponse("RECORD_SEARCH_FAILED", page.message, 502);
  return Response.json(page, { headers: NO_STORE });
};
