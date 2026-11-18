import type { CalendarMonth } from "@/lib/events/calendar-month";
import { shiftMonth } from "./month";

/** 한 달 일정의 받는 상태 */
export type MonthState = { status: "loading" } | { status: "loaded"; data: CalendarMonth } | { status: "failed" };

/** 캘린더 화면이 넘겨 본 달의 일정을 기억한다(#348) */
export interface MonthCache {
  /** 그 달의 상태. 묻지 않은 달이면 `undefined` */
  get: (month: string) => MonthState | undefined;
  /** 받은 적 없거나 받지 못한 달이면 받는다. 받는 중이거나 받은 달은 다시 묻지 않는다 */
  load: (month: string) => void;
  /** 상태가 바뀔 때마다 알린다 */
  subscribe: (listener: () => void) => () => void;
}

interface CreateMonthCacheParams {
  load: (month: string) => Promise<CalendarMonth>;
  /** 서버가 화면과 함께 보낸 달 */
  initial: { month: string; data: CalendarMonth };
}

const LOADING: MonthState = { status: "loading" };
const FAILED: MonthState = { status: "failed" };

/**
 * 달별 일정 기억을 만든다. 화면이 서버에서 새로 받으면(저장 뒤 등) 새로 만들어 넘겨 본 달도 다시 받게 한다.
 *
 * @example
 * const cache = createMonthCache({ load: loadCalendarMonth, initial: { month, data: { events, records } } });
 * cache.load(shiftMonth(month, 1));
 */
export const createMonthCache = ({ load, initial }: CreateMonthCacheParams): MonthCache => {
  const states = new Map<string, MonthState>([[initial.month, { status: "loaded", data: initial.data }]]);
  const listeners = new Set<() => void>();
  const setState = (month: string, state: MonthState): void => {
    states.set(month, state);
    listeners.forEach((listener) => listener());
  };

  return {
    get: (month) => states.get(month),
    load: (month) => {
      const status = states.get(month)?.status;
      if (status === "loading" || status === "loaded") return;
      setState(month, LOADING);
      load(month).then(
        (data) => setState(month, { status: "loaded", data }),
        // 원인은 조회가 Supabase 오류로 담아 두었다. 화면은 다시 시도만 보여 준다
        () => setState(month, FAILED),
      );
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

/**
 * 미리 받아 둘 앞뒤 달.
 *
 * @example getAdjacentMonths("2026-01") // ["2025-12", "2026-02"]
 */
export const getAdjacentMonths = (month: string): [string, string] => [shiftMonth(month, -1), shiftMonth(month, 1)];
