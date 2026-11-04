import { toKstDate } from "@/lib/anniversary";

export interface MonthCrossingPeriod {
  startMonth: string;
  startDate: string;
  endMonth: string;
  endDate: string;
}

/**
 * 지난달 10일부터 이번 달 1일까지의 기간. 끝 날짜가 오늘보다 뒤로 가지 않아 언제 실행해도 유효한 기록이 된다.
 * 시작 날짜가 이번 달 달력에 함께 보이는 지난달 마지막 주보다 앞이라, 끝 날짜로만 찾을 수 있는 기록이 된다.
 *
 * 데이터를 만들 때와 테스트에서 값이 같도록 실행을 시작할 때 정한 기준 시각으로 계산한다.
 *
 * @example getMonthCrossingPeriod().endDate // "2026-11-01"
 */
export const getMonthCrossingPeriod = (): MonthCrossingPeriod => {
  const endMonth = toKstDate(new Date(process.env.E2E_NOW ?? Date.now())).slice(0, 7);
  const [year = 0, month = 0] = endMonth.split("-").map(Number);
  // JavaScript 달은 0부터 세므로 month - 2가 지난달이다. 1월이면 지난해 12월로 넘어간다
  const startMonth = new Date(Date.UTC(year, month - 2, 1)).toISOString().slice(0, 7);

  return { startMonth, startDate: `${startMonth}-10`, endMonth, endDate: `${endMonth}-01` };
};
