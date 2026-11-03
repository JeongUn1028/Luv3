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

const DAY_MS = 24 * 60 * 60 * 1000;

const KST_DATE_FORMAT = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * 시각을 한국 날짜(YYYY-MM-DD)로 바꾼다. 서버(Vercel은 UTC)와 기기 시간대에 상관없이 같은 D-day를 보여 주기 위해서다.
 *
 * @example toKstDate(new Date("2026-11-01T15:00:00Z")) // "2026-11-02"
 */
export const toKstDate = (date: Date): string => KST_DATE_FORMAT.format(date);

const toUtcMidnight = (isoDate: string): number => {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다: ${isoDate}`);
  const [, year, month, day] = match;
  return Date.UTC(Number(year), Number(month) - 1, Number(day));
};

/**
 * 사귄 날을 1일째로 세어 오늘이 며칠째인지 돌려준다(docs/plan.md "D-day 기준일").
 *
 * @example countDaysTogether("2026-10-31", "2026-11-02") // 3
 */
export const countDaysTogether = (anniversary: string, today: string): number => {
  const days = Math.round((toUtcMidnight(today) - toUtcMidnight(anniversary)) / DAY_MS) + 1;
  if (days < 1) throw new Error(`오늘(${today})이 기념일보다 이른 날입니다: ${anniversary}`);
  return days;
};

const parseIsoDate = (isoDate: string): { year: number; monthDay: string } => {
  const match = ISO_DATE_PATTERN.exec(isoDate);
  if (!match) throw new Error(`날짜는 YYYY-MM-DD 형식이어야 합니다: ${isoDate}`);
  const [, year, month, day] = match;
  return { year: Number(year), monthDay: `${month}-${day}` };
};

/**
 * 달력에 보일 기념일 이름. 사귄 날과 해마다 돌아오는 날(1주년…)이며 아니면 undefined다.
 *
 * @example getAnniversaryLabel("2026-10-31", "2027-10-31") // "1주년"
 */
export const getAnniversaryLabel = (anniversary: string, date: string): string | undefined => {
  const start = parseIsoDate(anniversary);
  const target = parseIsoDate(date);
  if (date < anniversary) return undefined;
  if (date === anniversary) return "사귄 날";
  if (target.monthDay !== start.monthDay) return undefined;

  return `${target.year - start.year}주년`;
};
