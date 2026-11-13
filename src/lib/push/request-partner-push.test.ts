import { afterEach, describe, expect, it, vi } from "vitest";
import { PUSH_NOTIFY_PATH } from "./message";
import { requestPartnerPush } from "./request-partner-push";

describe("requestPartnerPush", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // 아이폰 Safari에서 keepalive 요청은 나가지 않았다(#374). 시험 알림처럼 보통 요청으로 보낸다
  it("알림 열쇠가 있으면 keepalive 없는 보통 요청으로 글 종류와 id를 보낸다", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
    const fetcher = vi.fn(async () => Response.json({ sentCount: 1 }));

    // Act
    requestPartnerPush({ kind: "event", id: "event-1" }, fetcher);

    // Assert
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [path, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe(PUSH_NOTIFY_PATH);
    expect(init.method).toBe("POST");
    expect(init.keepalive).toBeUndefined();
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ kind: "event", id: "event-1" }));
  });

  it("알림 열쇠가 없으면 부탁하지 않는다", () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "");
    const fetcher = vi.fn(async () => Response.json({ sentCount: 1 }));

    // Act
    requestPartnerPush({ kind: "comment", id: "comment-1" }, fetcher);

    // Assert
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("부탁이 실패해도 던지지 않고 기록만 남긴다", async () => {
    // Arrange
    vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "public-key");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn(async () => {
      throw new TypeError("Load failed");
    });

    // Act
    requestPartnerPush({ kind: "record", id: "record-1" }, fetcher);
    await vi.waitFor(() => expect(consoleError).toHaveBeenCalledTimes(1));

    // Assert
    expect(consoleError.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    consoleError.mockRestore();
  });
});
