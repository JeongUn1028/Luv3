import { formatPeriodMonthDay, toMonthDay, type RecordPeriod } from "./album";

const WEEKDAY_FORMAT = new Intl.DateTimeFormat("ko-KR", { weekday: "long", timeZone: "UTC" });

const toWeekday = (isoDate: string): string => WEEKDAY_FORMAT.format(new Date(`${isoDate}T00:00:00Z`));

/**
 * 상세 화면 날짜 표기: "2026.11.02 월요일". 날짜만 있는 값이라 시간대 영향을 받지 않게 UTC로 요일을 구한다.
 *
 * @example formatRecordDate("2026-11-02") // "2026.11.02 월요일"
 */
export const formatRecordDate = (isoDate: string): string => `${isoDate.replaceAll("-", ".")} ${toWeekday(isoDate)}`;

/**
 * 좁은 칸에 쓰는 기록 날짜: 연도 없이 MM.DD와 요일.
 *
 * @example formatRecordMonthDay("2026-11-02") // "11.02 월요일"
 */
export const formatRecordMonthDay = (isoDate: string): string => `${toMonthDay(isoDate)} ${toWeekday(isoDate)}`;

/**
 * 상세 화면 날짜 표기. 기간이면 끝 날짜를 덧붙이고, 해가 같으면 끝 날짜의 연도는 뺀다.
 *
 * @example formatRecordPeriod({ date: "2026-10-31", endDate: "2026-11-02" }) // "2026.10.31 토요일 – 11.02 월요일"
 */
export const formatRecordPeriod = ({ date, endDate }: RecordPeriod): string => {
  if (!endDate) return formatRecordDate(date);
  const isSameYear = date.slice(0, 4) === endDate.slice(0, 4);
  return `${formatRecordDate(date)} – ${isSameYear ? formatRecordMonthDay(endDate) : formatRecordDate(endDate)}`;
};

/**
 * 좁은 칸(홈 최근 데이트)에 쓰는 기록 날짜. 하루짜리는 요일까지, 기간은 그리드와 같은 표기로 쓴다.
 *
 * @example formatRecordShortDate({ date: "2026-11-01", endDate: "2026-11-03" }) // "11.01–11.03"
 */
export const formatRecordShortDate = ({ date, endDate }: RecordPeriod): string =>
  endDate ? formatPeriodMonthDay({ date, endDate }) : formatRecordMonthDay(date);
