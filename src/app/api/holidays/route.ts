import { getCurrentMember } from "@/lib/auth/member";
import { parseHolidayYear } from "@/lib/holidays/holidays";
import { getHolidays } from "@/lib/holidays/server";
import { NO_STORE_HEADERS, toErrorResponse } from "@/lib/api-response";

/**
 * 날짜 창의 공휴일. 날짜 창은 브라우저에서 돌고 키는 브라우저에 보내지 않으므로 서버가 대신 받는다.
 * 하루 호출 한도를 남이 쓰지 못하게 허용목록 멤버만 받는다(아니면 로그인 화면으로 보낸다).
 * 키가 없으면 공휴일이 없는 것과 같게 빈 목록을 돌려준다.
 */
export const GET = async (request: Request): Promise<Response> => {
  await getCurrentMember();

  const year = parseHolidayYear(new URL(request.url).searchParams.get("year"));
  if (year === undefined) return toErrorResponse("INVALID_YEAR", "해를 다시 골라 주세요.", 400);

  const holidays = await getHolidays(year);
  // 받지 못한 결과를 브라우저가 그해의 답으로 기억하지 않게 실패로 알린다. 원인은 getHolidays가 서버 로그에 남긴다
  if (!holidays) return toErrorResponse("HOLIDAYS_FAILED", "공휴일을 불러오지 못했어요.", 502);
  return Response.json({ holidays }, { headers: NO_STORE_HEADERS });
};
