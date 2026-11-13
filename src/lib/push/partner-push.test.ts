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

// 잠금 화면에 글 내용이 보이지 않게, 누가 무엇을 했는지만 한 줄로 알린다(본문 없음, #364)
describe("알림 문구", () => {
  it("새 기록 알림은 남긴 사람만 알리고 기록 상세를 연다", () => {
    expect(toRecordPushMessage({ nickname: "진아", recordId: ID })).toEqual({
      title: "진아님이 기록을 남겼어요",
      body: "",
      url: `/dates/${ID}`,
    });
  });

  it("댓글 알림은 남긴 사람만 알리고 그 기록 상세의 댓글로 간다", () => {
    expect(toCommentPushMessage({ nickname: "진아", recordId: ID })).toEqual({
      title: "진아님이 댓글을 남겼어요",
      body: "",
      url: `/dates/${ID}#record-comments`,
    });
  });

  it("새 일정 알림은 추가한 사람만 알리고 캘린더의 그 날을 연다", () => {
    expect(toEventPushMessage({ nickname: "진아", date: "2026-11-20" })).toEqual({
      title: "진아님이 일정을 추가했어요",
      body: "",
      url: "/calendar?month=2026-11&date=2026-11-20",
    });
  });
});
