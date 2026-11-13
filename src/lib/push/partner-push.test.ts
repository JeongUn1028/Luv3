import { describe, expect, it } from "vitest";
import {
  parsePartnerPushBody,
  parsePartnerPushClaim,
  toCommentPushMessage,
  toEventPushMessage,
  toRecordPushMessage,
} from "./partner-push";

const ID = "10000000-0000-4000-8000-000000000001";
const SUBSCRIPTION = { endpoint: "https://push.example/b", p256dh: "key", auth: "auth" };

describe("parsePartnerPushBody", () => {
  it("종류와 uuid id가 있으면 부탁으로 읽는다", () => {
    expect(parsePartnerPushBody({ kind: "comment", id: ID })).toEqual({ kind: "comment", id: ID });
  });

  it("모르는 종류, uuid가 아닌 id, 객체가 아닌 값이면 undefined를 돌려준다", () => {
    expect(parsePartnerPushBody({ kind: "todo", id: ID })).toBeUndefined();
    expect(parsePartnerPushBody({ kind: "record", id: "1; drop table" })).toBeUndefined();
    expect(parsePartnerPushBody({ kind: "record" })).toBeUndefined();
    expect(parsePartnerPushBody(undefined)).toBeUndefined();
  });
});

describe("parsePartnerPushClaim", () => {
  it("보낼 준비가 됐으면 받는 사람마다 숫자와 구독을 읽는다", () => {
    // Arrange
    const value = { status: "ready", recipients: [{ badge: 3, subscriptions: [SUBSCRIPTION] }] };

    // Act & Assert
    expect(parsePartnerPushClaim(value)).toEqual({ status: "ready", recipients: [{ badge: 3, subscriptions: [SUBSCRIPTION] }] });
  });

  it("보내지 않는 이유를 그대로 읽는다", () => {
    expect(parsePartnerPushClaim({ status: "already-sent" })).toEqual({ status: "already-sent" });
    expect(parsePartnerPushClaim({ status: "not-new" })).toEqual({ status: "not-new" });
  });

  it("모르는 상태나 모양이 다른 받는 사람이 있으면 undefined를 돌려준다", () => {
    expect(parsePartnerPushClaim({ status: "unknown" })).toBeUndefined();
    expect(parsePartnerPushClaim({ status: "ready" })).toBeUndefined();
    expect(parsePartnerPushClaim({ status: "ready", recipients: [{ badge: "3", subscriptions: [] }] })).toBeUndefined();
    expect(parsePartnerPushClaim({ status: "ready", recipients: [{ badge: 1, subscriptions: [{ endpoint: "x" }] }] })).toBeUndefined();
    expect(parsePartnerPushClaim(null)).toBeUndefined();
  });
});

describe("알림 문구", () => {
  it("새 기록 알림은 남긴 사람·날짜·제목을 보이고 기록 상세를 연다", () => {
    expect(toRecordPushMessage({ nickname: "진아", recordId: ID, date: "2026-11-12", title: "한강 피크닉" })).toEqual({
      title: "진아님이 기록을 남겼어요",
      body: "11월 12일 · 한강 피크닉",
      url: `/dates/${ID}`,
    });
  });

  it("댓글 알림은 댓글을 보이고 그 기록 상세의 댓글로 간다", () => {
    expect(toCommentPushMessage({ nickname: "진아", recordId: ID, content: "이 사진 너무\n잘 나왔다" })).toEqual({
      title: "진아님의 댓글",
      body: "이 사진 너무 잘 나왔다",
      url: `/dates/${ID}#record-comments`,
    });
  });

  it("댓글이 50자를 넘으면 앞 50자에 말줄임표를 붙인다(이모지는 한 글자로 센다)", () => {
    // Arrange
    const content = `${"😀".repeat(50)}넘친 글`;

    // Act
    const { body } = toCommentPushMessage({ nickname: "진아", recordId: ID, content });

    // Assert
    expect(body).toBe(`${"😀".repeat(50)}…`);
  });

  it("새 일정 알림은 날짜(요일)·시간·제목을 보이고 캘린더의 그 날을 연다", () => {
    expect(toEventPushMessage({ nickname: "진아", date: "2026-11-20", startTime: "19:00:00", title: "저녁 약속" })).toEqual({
      title: "진아님이 일정을 추가했어요",
      body: "11월 20일(금) 19:00 · 저녁 약속",
      url: "/calendar?month=2026-11&date=2026-11-20",
    });
  });

  it("시간 없는 일정은 시간 없이 날짜만 적는다", () => {
    expect(toEventPushMessage({ nickname: "진아", date: "2026-11-19", startTime: null, title: "생일 준비" }).body).toBe("11월 19일(목) · 생일 준비");
  });
});
