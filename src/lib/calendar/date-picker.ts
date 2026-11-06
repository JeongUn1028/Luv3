import { isIsoDate } from "@/lib/form";
import { buildMonthGrid } from "./month";

/** 고를 수 있는 날의 범위. 비어 있으면 그쪽으로는 끝이 없다 */
export interface DateBounds {
  /** 고를 수 있는 첫날 YYYY-MM-DD */
  min?: string | undefined;
  /** 고를 수 있는 마지막 날 YYYY-MM-DD */
  max?: string | undefined;
}

/** 초점을 둘 날을 정할 때 보는 값 */
export interface FocusDateParams {
  /** 보고 있는 달 YYYY-MM */
  month: string;
  /** 지금 값. 비어 있거나 틀릴 수 있다 */
  value: string;
  /** 오늘 YYYY-MM-DD */
  today: string;
  bounds: DateBounds;
}

const ARROW_KEY_DAY_OFFSETS: Readonly<Record<string, number>> = {
  ArrowLeft: -1,
  ArrowRight: 1,
  ArrowUp: -7,
  ArrowDown: 7,
};

/**
 * 범위 안의 날인지.
 *
 * @example isSelectableDate("2026-11-07", { max: "2026-11-06" }) // false
 */
export const isSelectableDate = (date: string, { min, max }: DateBounds): boolean =>
  (!min || date >= min) && (!max || date <= max);

/**
 * 달을 고를 수 있는 날이 있는 달로 당긴다. 범위 밖이면 범위 안의 가장 가까운 달이다.
 *
 * @example clampMonth("2026-12", { max: "2026-11-06" }) // "2026-11"
 */
export const clampMonth = (month: string, { min, max }: DateBounds): string => {
  if (min && month < min.slice(0, 7)) return min.slice(0, 7);
  if (max && month > max.slice(0, 7)) return max.slice(0, 7);
  return month;
};

/**
 * 창을 처음 열 달. 값의 달을 열고, 값이 없으면 오늘의 달을 연다. 범위 밖이면 범위 안의 가장 가까운 달로 옮긴다.
 *
 * @example getInitialMonth("", "2026-11-06", {}) // "2026-11"
 */
export const getInitialMonth = (value: string, today: string, bounds: DateBounds): string =>
  clampMonth((isIsoDate(value) ? value : today).slice(0, 7), bounds);

/**
 * 키보드 초점을 둘 날: 보는 달의 지금 값, 오늘, 고를 수 있는 첫날 순서로 찾는다.
 *
 * @example getFocusDate({ month: "2026-12", value: "", today: "2026-11-06", bounds: {} }) // "2026-12-01"
 */
export const getFocusDate = ({ month, value, today, bounds }: FocusDateParams): string | undefined => {
  const monthDates = buildMonthGrid(month)
    .flat()
    .map(({ date }) => date);
  return [value, today, ...monthDates].find(
    (date) => date.startsWith(`${month}-`) && isIsoDate(date) && isSelectableDate(date, bounds),
  );
};

/**
 * 화살표 키로 옮길 날 수. 화살표가 아니면 undefined다.
 *
 * @example getKeyboardDayOffset("ArrowDown") // 7
 */
export const getKeyboardDayOffset = (key: string): number | undefined => ARROW_KEY_DAY_OFFSETS[key];
