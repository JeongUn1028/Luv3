// 기록·일정 폼이 함께 쓰는 입력값 도우미

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * DB의 `char_length`처럼 글자 수를 센다(이모지 하나 = 한 글자). JS의 `length`는 이모지를 두 글자로 센다.
 *
 * @example countChars("😀") // 1
 */
export const countChars = (text: string): number => Array.from(text).length;

/**
 * 화면에 보이는 글자 수를 센다. 여러 코드 포인트를 합쳐 그리는 이모지도 한 글자다.
 * 이 파일을 불러오는 모든 화면이 Intl.Segmenter에 의존하지 않도록, 부를 때 만든다.
 *
 * @example countGraphemes("👨‍👩‍👧‍👦") // 1
 */
export const countGraphemes = (text: string): number => Array.from(new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(text)).length;

/**
 * YYYY-MM-DD 형식이면서 달력에 실제로 있는 날인지 확인한다. 주소 쿼리처럼 손으로 바꿀 수 있는 값은 형식만으로는 부족하다.
 *
 * @example isIsoDate("2026-02-31") // false
 */
export const isIsoDate = (value: string): boolean => {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  if (year === undefined || month === undefined || day === undefined) return false;
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

/**
 * 사용자가 고친 칸의 에러를 지운다. 다른 칸의 에러는 다시 저장할 때까지 그대로 둔다.
 *
 * @example clearError({ title: "제목을 적어 주세요." }, "title") // {}
 */
export const clearError = <Errors extends Partial<Record<string, string>>>(errors: Errors, key: keyof Errors): Errors => {
  if (!(key in errors)) return errors;
  const next = { ...errors };
  delete next[key];
  return next;
};
