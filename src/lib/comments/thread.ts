import { formatCommentTime, type RecordComment } from "./comment";

/** 기록 상세에 그리는 댓글 하나. 서버에서 읽은 댓글과 저장을 기다리는 내 댓글을 함께 담는다 */
export interface ShownComment extends RecordComment {
  /** 남긴 시각 글자. 서버에서 읽은 댓글은 서버에서 정해, 처음 그린 화면과 브라우저가 이어 그린 화면이 어긋나지 않게 한다 */
  timeLabel: string;
  /** 저장을 기다리는 중이면 시각 대신 "남기는 중…"을 보이고 삭제를 붙이지 않는다 */
  isSending: boolean;
}

/**
 * 서버에서 읽은 댓글에 남긴 시각 글자를 붙인다.
 *
 * @param now 연도를 붙일지 정하는 지금 시각
 * @example const shown = toShownComments(comments, new Date())
 */
export const toShownComments = (comments: RecordComment[], now: Date): ShownComment[] =>
  comments.map((comment) => ({ ...comment, timeLabel: formatCommentTime(comment.createdAt, now), isSending: false }));

interface CreateSendingCommentParams {
  /** 남기기 전에 정한 댓글 id. 같은 id로 저장해, 다시 받은 목록의 댓글과 같은 줄로 이어진다 */
  id: string;
  /** 앞뒤 공백을 뺀 내용 */
  content: string;
  /** 지금 로그인한 사람의 닉네임 */
  authorNickname: string;
  now: Date;
}

/**
 * 남기기를 누른 순간 목록 끝에 먼저 붙일 내 댓글을 만든다.
 *
 * @example createSendingComment({ id: crypto.randomUUID(), content: "또 가자", authorNickname: nickname, now: new Date() })
 */
export const createSendingComment = ({ id, content, authorNickname, now }: CreateSendingCommentParams): ShownComment => {
  const createdAt = now.toISOString();
  return { id, content, createdAt, authorNickname, isMine: true, timeLabel: formatCommentTime(createdAt, now), isSending: true };
};

/** 저장을 기다리지 않고 목록에 먼저 반영하는 동작 */
export type CommentAction = { type: "add"; comment: ShownComment } | { type: "saved"; id: string } | { type: "remove"; id: string };

/**
 * 목록에 동작을 반영한다(`useOptimistic`의 갱신 함수). 저장이 끝나 다시 받은 목록에도 다시 적용되므로,
 * 이미 반영된 동작은 목록을 그대로 돌려준다.
 *
 * @example applyCommentAction(comments, { type: "remove", id })
 */
export const applyCommentAction = (comments: ShownComment[], action: CommentAction): ShownComment[] => {
  switch (action.type) {
    case "add":
      return comments.some(({ id }) => id === action.comment.id) ? comments : [...comments, action.comment];
    case "saved":
      if (!comments.some(({ id, isSending }) => id === action.id && isSending)) return comments;
      return comments.map((comment) => (comment.id === action.id ? { ...comment, isSending: false } : comment));
    case "remove":
      return comments.some(({ id }) => id === action.id) ? comments.filter(({ id }) => id !== action.id) : comments;
  }
};
