import { withCurrentMember } from "@/lib/auth/with-member";
import { parseRecordSearchParams } from "@/lib/dates/search-api";
import { RecordSearchLoadError, searchRecords } from "@/lib/dates/search-queries";
import { catchLoadError } from "@/lib/load";
import { NO_STORE_HEADERS, toErrorResponse } from "@/lib/api-response";

/**
 * 기록 탭 찾기(#273). 검색어·태그에 맞는 기록을 한 묶음씩 돌려준다.
 * 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 */
export const GET = async (request: Request): Promise<Response> => {
  const params = parseRecordSearchParams(new URL(request.url).searchParams);
  // 멤버 확인과 찾기를 함께 시작한다(#344). 조건이 잘못됐어도 멤버가 아니면 400보다 멤버 확인의 이동이 먼저다.
  // 실패 원인만 로그에 남는다. 검색어는 둘만의 기록 내용이 드러나므로 남기지 않는다
  const [, page] = await withCurrentMember(async () =>
    params ? catchLoadError(() => searchRecords(params), RecordSearchLoadError) : undefined,
  );
  if (!page) return toErrorResponse("INVALID_QUERY", "찾을 내용을 다시 적어 주세요.", 400);
  if (page instanceof RecordSearchLoadError) return toErrorResponse("RECORD_SEARCH_FAILED", page.message, 502);
  return Response.json(page, { headers: NO_STORE_HEADERS });
};
