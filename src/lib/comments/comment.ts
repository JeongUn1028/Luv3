import type { AuthorRow } from "@/lib/author";
import { countChars } from "@/lib/form";

/** 기록 상세의 댓글 제목. 댓글을 지워 초점이 갈 곳을 잃으면 이리로 옮긴다 */
export const COMMENTS_HEADING_ID = "record-comments";

// 글자 수 제한은 DB check 제약(마이그레이션)과 같아야 한다
export const COMMENT_MAX_LENGTH = 200;

/**
 * 남기기 전에 댓글 내용을 확인한다. 앞뒤 공백은 빼고 센다. 문제가 없으면 undefined다.
 *
 * @example validateComment("") // "댓글을 적어 주세요."
 */
export const validateComment = (content: string): string | undefined => {
  const trimmed = content.trim();
  if (trimmed === "") return "댓글을 적어 주세요.";
  if (countChars(trimmed) > COMMENT_MAX_LENGTH) return `${COMMENT_MAX_LENGTH}자까지 적을 수 있어요.`;
  return undefined;
};

/** 기록 상세에서 읽는 `comments` 행(작성자 포함) */
export interface CommentRow {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  author: AuthorRow;
}

/** 기록 상세 아래에 그리는 댓글 하나 */
export interface RecordComment {
  id: string;
  content: string;
  /** 남긴 시각(ISO) */
  createdAt: string;
  /** 읽지 못했으면 이름표를 그리지 않는다 */
  authorNickname: string | undefined;
  /** 내가 쓴 댓글이면 지우기 버튼을 그린다(DB도 쓴 사람만 지우게 막는다) */
  isMine: boolean;
}

/**
 * 조회한 행을 화면용 값으로 바꾼다.
 *
 * @param memberId 지금 로그인한 사람. 이 사람이 쓴 댓글만 지울 수 있다
 * @example const comments = rows.map((row) => toRecordComment(row, member.id))
 */
export const toRecordComment = ({ id, content, created_at, author_id, author }: CommentRow, memberId: string): RecordComment => ({
  id,
  content,
  createdAt: created_at,
  authorNickname: author?.nickname,
  isMine: author_id === memberId,
});

// 서버(Vercel은 UTC)와 기기 시간대에 상관없이 한국 시간으로 보여 준다
const KST_YEAR_FORMAT = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric" });
const KST_TIME_FORMAT = new Intl.DateTimeFormat("ko-KR", {
  timeZone: "Asia/Seoul",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/**
 * 댓글을 남긴 시각을 한국 시간으로 보여 준다. 올해가 아니면 연도를 앞에 붙인다.
 *
 * @example formatCommentTime("2026-11-09T06:20:00Z", new Date("2026-11-09T12:00:00+09:00")) // "11월 9일 오후 3:20"
 */
export const formatCommentTime = (createdAt: string, now: Date): string => {
  const created = new Date(createdAt);
  const year = KST_YEAR_FORMAT.format(created);
  const time = KST_TIME_FORMAT.format(created);
  return year === KST_YEAR_FORMAT.format(now) ? time : `${year}년 ${time}`;
};
