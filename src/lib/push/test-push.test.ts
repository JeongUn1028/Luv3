import { describe, expect, it } from "vitest";
import { parseTestPushBody, TEST_PUSH_FAILED_MESSAGE, toTestPushOutcome } from "./test-push";

describe("parseTestPushBody", () => {
  it("지금 기기의 구독 주소를 읽는다", () => {
    // Act & Assert
    expect(parseTestPushBody({ endpoint: "https://push.example/1" })).toEqual({ endpoint: "https://push.example/1" });
  });

  it.each([
    ["본문이 없으면", undefined],
    ["주소가 없으면", {}],
    ["주소가 글자가 아니면", { endpoint: 1 }],
    ["https가 아니면", { endpoint: "http://push.example/1" }],
  ])("%s 읽지 않는다", (_, value) => {
    // Act & Assert
    expect(parseTestPushBody(value)).toBeUndefined();
  });
});

describe("toTestPushOutcome", () => {
  it("성공 응답이면 보냈다고 본다", () => {
    // Act & Assert
    expect(toTestPushOutcome({ ok: true, redirected: false, body: { sentCount: 1 } })).toEqual({ kind: "sent" });
  });

  // 로그인이 끊기면 서버가 로그인 화면으로 넘기고, fetch는 따라가 그 화면의 200을 받는다
  it("로그인 화면으로 넘겨진 200은 보내지 못한 것으로 본다", () => {
    // Act
    const outcome = toTestPushOutcome({ ok: true, redirected: true, body: undefined });

    // Assert
    expect(outcome).toEqual({ kind: "failed", message: "로그인이 끊겼어요. 다시 로그인한 뒤 보내 주세요." });
  });

  it("서버에 이 기기의 구독이 없다는 오류면 다시 켜게 한다", () => {
    // Act
    const outcome = toTestPushOutcome({ ok: false, redirected: false, body: { code: "PUSH_NOT_SUBSCRIBED", message: "이 기기에서 알림을 먼저 켜 주세요." } });

    // Assert
    expect(outcome).toEqual({ kind: "not-subscribed", message: "이 기기에서 알림을 먼저 켜 주세요." });
  });

  it("그 밖의 오류는 서버 문구를 그대로 보여 준다", () => {
    // Act & Assert
    expect(toTestPushOutcome({ ok: false, redirected: false, body: { code: "PUSH_SEND_FAILED", message: "보내지 못했어요." } })).toEqual({
      kind: "failed",
      message: "보내지 못했어요.",
    });
  });

  it("오류 본문이 JSON이 아니면 기본 문구를 보여 준다", () => {
    // Act & Assert
    expect(toTestPushOutcome({ ok: false, redirected: false, body: undefined })).toEqual({ kind: "failed", message: TEST_PUSH_FAILED_MESSAGE });
  });
});
