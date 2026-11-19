import { getWeekday, WEEKDAYS } from "@/lib/calendar/month";
import { formatEventOwner } from "@/lib/events/calendar";
import type { TodoEvent } from "./list";

/** 하고 싶은 것에 이어진 일정 칩의 글자와, 일정 날짜가 지났는지 */
export interface TodoEventChip {
  label: string;
  /** 지났으면 크림색으로 그린다 */
  isPast: boolean;
}

/** "11월 23일". 날짜 글자(YYYY-MM-DD)만 보고 만들어 시간대와 상관없다 */
const formatMonthDay = (isoDate: string): string => `${Number(isoDate.slice(5, 7))}월 ${Number(isoDate.slice(8, 10))}일`;

/**
 * 이어진 일정의 마지막 날(YYYY-MM-DD). 하루 일정은 그날, 기간 일정은 끝 날짜다. 이날이 지나야 지난 일정으로 본다.
 *
 * @example getTodoEventLastDay({ ...event, date: "2026-11-23", endDate: "2026-11-25" }) // "2026-11-25"
 */
export const getTodoEventLastDay = (event: TodoEvent): string => event.endDate ?? event.date;

/**
 * 하고 싶은 것에 이어진 일정 칩(#471). 오늘이거나 앞으로의 일정은 "11월 23일 월", 지난 일정은 "11월 23일 지남".
 * 하고 싶은 것은 둘이 함께 하는 것이 기본이라 함께 일정에는 "함께"를 쓰지 않고, 한 사람 일정만 "11월 23일 월 · 정운"처럼 누구 일정인지 붙인다.
 * 기간 일정은 시작일로 쓰고, 끝 날짜가 지나야 지난 것으로 본다. 날짜를 미루면 새 날짜로 다시 계산한다.
 *
 * @param today 오늘(한국 날짜, YYYY-MM-DD)
 * @example formatTodoEventChip({ id, date: "2026-11-23", endDate: undefined, isTogether: true, authorNickname: "정운" }, "2026-11-19") // { label: "11월 23일 월", isPast: false }
 */
export const formatTodoEventChip = (event: TodoEvent, today: string): TodoEventChip => {
  const isPast = getTodoEventLastDay(event) < today;
  if (isPast) return { label: `${formatMonthDay(event.date)} 지남`, isPast };
  const dayLabel = `${formatMonthDay(event.date)} ${WEEKDAYS[getWeekday(event.date)]}`;
  return { label: event.isTogether ? dayLabel : `${dayLabel} · ${formatEventOwner(event)}`, isPast };
};

/**
 * 지난 일정 묻기(#471): 이어진 일정의 마지막 날이 지났고, 그 마지막 날에 [아직]을 누르지 않았으면 "다녀오셨나요?"를 묻는다.
 * [아직]은 누를 때의 마지막 날만 기억해, 일정을 미뤄 마지막 날이 달라지면 미룬 날짜가 지났을 때 다시 묻는다.
 * 하지 않은 항목인지는 부르는 쪽이 본다.
 *
 * @param today 오늘(한국 날짜, YYYY-MM-DD)
 * @example shouldAskTodoEventDone({ ...event, date: "2026-11-23", notYetDate: undefined }, "2026-11-24") // true
 */
export const shouldAskTodoEventDone = (event: TodoEvent, today: string): boolean => {
  const lastDay = getTodoEventLastDay(event);
  return lastDay < today && event.notYetDate !== lastDay;
};
