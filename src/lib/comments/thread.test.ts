import { describe, expect, it } from "vitest";
import type { RecordComment } from "./comment";
import { applyCommentAction, createSendingComment, toShownComments, type ShownComment } from "./thread";

const NOW = new Date("2026-11-12T12:00:00+09:00");

const savedComment: ShownComment = {
  id: "c1",
  content: "여기 또 가자!",
  createdAt: "2026-11-12T06:20:00Z",
  authorNickname: "하늘",
  isMine: false,
  timeLabel: "11월 12일 오후 3:20",
  isSending: false,
};

const sendingComment = createSendingComment({ id: "c2", content: "좋아, 다음 달에 꼭", authorNickname: "바다", now: NOW });

describe("toShownComments", () => {
  it("서버에서 읽은 댓글에 남긴 시각 글자를 붙이고 저장된 것으로 표시한다", () => {
    // Arrange
    const comments: RecordComment[] = [{ id: "c1", content: "좋았어", createdAt: "2025-11-09T06:20:00Z", authorNickname: "하늘", isMine: true }];

    // Act
    const shown = toShownComments(comments, NOW);

    // Assert
    expect(shown).toEqual([{ ...comments[0], timeLabel: "2025년 11월 9일 오후 3:20", isSending: false }]);
  });
});

describe("createSendingComment", () => {
  it("내가 지금 남기는 댓글을 저장 중으로 만든다", () => {
    expect(sendingComment).toEqual({
      id: "c2",
      content: "좋아, 다음 달에 꼭",
      createdAt: "2026-11-12T03:00:00.000Z",
      authorNickname: "바다",
      isMine: true,
      timeLabel: "11월 12일 오후 12:00",
      isSending: true,
    });
  });
});

describe("applyCommentAction", () => {
  it("남기면 목록 끝에 붙인다", () => {
    expect(applyCommentAction([savedComment], { type: "add", comment: sendingComment })).toEqual([savedComment, sendingComment]);
  });

  it("다시 받은 목록에 이미 있는 댓글은 한 번 더 붙이지 않는다", () => {
    // Arrange: 저장이 끝나 새로 받은 목록에 같은 id의 댓글이 들어 있다
    const refreshed = [savedComment, { ...sendingComment, isSending: false }];

    // Act
    const next = applyCommentAction(refreshed, { type: "add", comment: sendingComment });

    // Assert
    expect(next).toBe(refreshed);
  });

  it("저장이 끝나면 그 댓글만 저장된 것으로 바꾼다", () => {
    // Act
    const next = applyCommentAction([savedComment, sendingComment], { type: "saved", id: "c2" });

    // Assert
    expect(next).toEqual([savedComment, { ...sendingComment, isSending: false }]);
  });

  it("저장이 끝났다는 댓글이 목록에 없으면 그대로 둔다", () => {
    // Arrange
    const comments = [savedComment];

    // Act
    const next = applyCommentAction(comments, { type: "saved", id: "c2" });

    // Assert
    expect(next).toBe(comments);
  });

  it("지우면 그 댓글만 목록에서 뺀다", () => {
    expect(applyCommentAction([savedComment, sendingComment], { type: "remove", id: "c1" })).toEqual([sendingComment]);
  });

  it("지운 댓글이 이미 목록에 없으면 그대로 둔다", () => {
    // Arrange: 다시 받은 목록에서 이미 빠졌다
    const comments = [sendingComment];

    // Act
    const next = applyCommentAction(comments, { type: "remove", id: "c1" });

    // Assert
    expect(next).toBe(comments);
  });
});
