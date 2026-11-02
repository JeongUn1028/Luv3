/** 사귄 날. D-day는 이 날을 1일째로 센다(docs/plan.md "D-day 기준일"). */
export const ANNIVERSARY_DATE = "2026-10-31";

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * 기념일을 로고 아래 표기(`SINCE YYMMDD`)로 바꾼다.
 *
 * @example formatSinceLabel("2026-10-31") // "SINCE 261031"
 */
export const formatSinceLabel = (isoDate: string): string => {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) throw new Error(`기념일은 YYYY-MM-DD 형식이어야 합니다: ${isoDate}`);

  const [, year, month, day] = match;
  return `SINCE ${year.slice(2)}${month}${day}`;
};
