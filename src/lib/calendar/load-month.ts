import { readCalendarMonth, type CalendarMonth } from "@/lib/events/calendar-month";
import { loadClient } from "@/lib/supabase/load-client";

/**
 * 넘긴 달의 일정과 기록을 브라우저에서 바로 읽는다. 화면을 서버에 다시 묻지 않으므로 달력 칸은 곧바로 그린다(#348).
 * 로그인이 끊겼으면 Supabase 클라이언트가 알아채 다시 로그인 창을 띄운다(#102).
 *
 * @throws {EventLoadError} 조회가 실패했을 때. 라이브러리 파일을 받지 못하면 그 오류를 던진다
 * @example const { events, records } = await loadCalendarMonth("2026-12")
 */
export const loadCalendarMonth = async (month: string): Promise<CalendarMonth> => readCalendarMonth(await loadClient(), month);
