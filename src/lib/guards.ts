// 바깥에서 받은 값(API 응답·JSON 파일·주소 쿼리)을 좁히는 공용 검사.
// scripts/(GitHub Actions에서 의존성 없이 Node로 실행)도 상대 경로로 불러오므로 다른 파일을 불러오지 않는다

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * null도 배열도 아닌 객체인지 확인한다. 통과하면 칸을 하나씩 읽어 검사할 수 있다.
 *
 * @example if (isObject(body) && typeof body.code === "string") console.error(body.code);
 */
export const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** YYYY-MM-DD를 나눈 글자. 앞자리 0을 그대로 둔다 */
export interface IsoDateParts {
  year: string;
  month: string;
  day: string;
}

/**
 * YYYY-MM-DD 형식이면 해·달·날 글자로 나눈다. 형식만 보므로 13월 45일도 나뉜다(실제 날짜 검사는 `isIsoDate`).
 *
 * @example splitIsoDate("2026-10-31") // { year: "2026", month: "10", day: "31" }
 */
export const splitIsoDate = (value: string): IsoDateParts | undefined => {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return undefined;
  const [, year = "", month = "", day = ""] = match;
  return { year, month, day };
};
