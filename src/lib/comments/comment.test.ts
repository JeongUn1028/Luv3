import { describe, expect, it } from "vitest";
import { formatCommentTime, toRecordComment, validateComment } from "./comment";

describe("validateComment", () => {
  it("앞뒤 공백을 빼고 내용이 있으면 에러가 없다", () => {
    expect(validateComment("  또 가자  ")).toBeUndefined();
  });

  it("공백만 있으면 댓글을 적어 달라고 한다", () => {
    expect(validateComment(" \n ")).toBe("댓글을 적어 주세요.");
  });

  it("200자까지는 받고, 넘으면 글자 수 제한을 알린다", () => {
    expect(validateComment("가".repeat(200))).toBeUndefined();
    expect(validateComment("가".repeat(201))).toBe("200자까지 적을 수 있어요.");
  });

  it("이모지는 DB처럼 한 글자로 센다", () => {
    expect(validateComment("😀".repeat(200))).toBeUndefined();
  });
});

describe("toRecordComment", () => {
  const row = {
    id: "c1",
    content: "좋았어",
    created_at: "2026-11-09T06:20:00+00:00",
    author_id: "me",
    author: { nickname: "정운" },
  };

  it("내가 쓴 댓글이면 지울 수 있다고 표시한다", () => {
    expect(toRecordComment(row, "me")).toEqual({
      id: "c1",
      content: "좋았어",
      createdAt: "2026-11-09T06:20:00+00:00",
      authorNickname: "정운",
      isMine: true,
    });
  });

  it("상대가 쓴 댓글은 지울 수 없다고 표시한다", () => {
    expect(toRecordComment(row, "partner").isMine).toBe(false);
  });

  it("작성자를 읽지 못하면 닉네임을 비운다", () => {
    expect(toRecordComment({ ...row, author: null }, "me").authorNickname).toBeUndefined();
  });
});

describe("formatCommentTime", () => {
  const now = new Date("2026-11-09T12:00:00+09:00");

  it("올해 댓글은 한국 시간으로 월·일과 시각을 보여 준다", () => {
    // UTC 06:20은 한국 시간 오후 3:20이다
    expect(formatCommentTime("2026-11-09T06:20:00+00:00", now)).toBe("11월 9일 오후 3:20");
  });

  it("한국 날짜로 해가 바뀌는 때도 한국 시간 기준으로 연도를 판단한다", () => {
    // UTC로는 2025년 12월 31일이지만 한국 시간으로는 2026년 1월 1일 오전 1:00이다
    expect(formatCommentTime("2025-12-31T16:00:00+00:00", now)).toBe("1월 1일 오전 1:00");
  });

  it("지난해 이전 댓글은 연도도 보여 준다", () => {
    expect(formatCommentTime("2025-11-09T06:20:00+00:00", now)).toBe("2025년 11월 9일 오후 3:20");
  });
});
