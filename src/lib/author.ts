/** 기록·일정 조회 때 `author:members!..._author_id_fkey(nickname)`로 함께 읽는 작성자. 읽지 못하면 null */
export type AuthorRow = { nickname: string } | null;

/** 하트 안에 들어가는 글자 수 */
const INITIALS_LENGTH = 2;

const GRAPHEME_SEGMENTER = new Intl.Segmenter("ko", { granularity: "grapheme" });

/**
 * 작성자 표시용으로 닉네임을 2글자로 줄인다. 2글자보다 길면 성을 빼고 부르듯 뒤 2글자를 쓴다.
 * 이모지·국기처럼 여러 코드로 된 글자가 반으로 잘리지 않게 화면에 보이는 글자 단위로 센다.
 *
 * @example toAuthorInitials("김정운") // "정운"
 * @example toAuthorInitials("진아") // "진아"
 */
export const toAuthorInitials = (nickname: string): string => {
  const graphemes = Array.from(GRAPHEME_SEGMENTER.segment(nickname.trim()), ({ segment }) => segment);
  return graphemes.slice(-INITIALS_LENGTH).join("");
};
