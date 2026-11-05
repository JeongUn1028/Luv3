/** 기록·일정 조회 때 `author:members!..._author_id_fkey(nickname)`로 함께 읽는 작성자. 읽지 못하면 null */
export type AuthorRow = { nickname: string } | null;
