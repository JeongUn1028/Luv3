import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth/member";
import { PUSH_TEST_MESSAGE } from "@/lib/push/message";
import { TEST_PUSH_FAILED_MESSAGE } from "@/lib/push/test-push";
import type { SendToSubscription, StoredPushSubscription } from "@/lib/push/send";
import { getVapidConfig } from "@/lib/push/vapid";
import { createWebPushSender } from "@/lib/push/web-push-sender";
import { createClient } from "@/lib/supabase/server";
import { POST } from "./route";

vi.mock("@/lib/auth/member", () => ({ getCurrentMember: vi.fn() }));
vi.mock("@/lib/push/vapid", () => ({ getVapidConfig: vi.fn() }));
vi.mock("@/lib/push/web-push-sender", () => ({ createWebPushSender: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const MEMBER_ID = "00000000-0000-0000-0000-00000000000a";
const VAPID = { publicKey: "public", privateKey: "private" };
const PHONE = "https://push.example/phone";

const subscription = (endpoint: string): StoredPushSubscription => ({ endpoint, p256dh: "key", auth: "auth" });

const requestWith = (body: unknown): Request =>
  new Request("http://localhost/api/push/test", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

interface FakeSupabaseOptions {
  rows?: StoredPushSubscription[];
  loadError?: { message: string };
  deleteError?: { message: string };
}

/** 이 경로가 부르는 두 조회(select…eq…eq, delete…in)만 흉내 내고, 받은 조건을 기록한다 */
const fakeSupabase = ({ rows = [], loadError, deleteError }: FakeSupabaseOptions) => {
  const calls = { selectedColumns: "", filters: {} as Record<string, string>, deletedEndpoints: [] as string[] };
  const filtered = {
    eq: (column: string, value: string) => {
      calls.filters[column] = value;
      return filtered;
    },
    then: (resolve: (value: unknown) => void) =>
      resolve(loadError ? { data: null, error: loadError } : { data: rows.filter((row) => row.endpoint === calls.filters.endpoint), error: null }),
  };
  const client = {
    from: (table: string) => {
      expect(table).toBe("push_subscriptions");
      return {
        select: (columns: string) => {
          calls.selectedColumns = columns;
          return filtered;
        },
        delete: () => ({
          in: (column: string, values: string[]) => {
            expect(column).toBe("endpoint");
            calls.deletedEndpoints = values;
            return Promise.resolve({ error: deleteError ?? null });
          },
        }),
      };
    },
  };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
};

const useSender = (send: SendToSubscription) => {
  vi.mocked(createWebPushSender).mockReturnValue(send);
};

const pushError = (statusCode: number, body = "") => Object.assign(new Error("Received unexpected response code"), { statusCode, body });

describe("POST /api/push/test", () => {
  beforeEach(() => {
    vi.mocked(getCurrentMember).mockResolvedValue({ id: MEMBER_ID, nickname: "정운" });
    vi.mocked(getVapidConfig).mockReturnValue(VAPID);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it("멤버가 아니면 구독을 읽지 않고 멤버 확인의 이동을 그대로 따른다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    vi.mocked(getCurrentMember).mockRejectedValue(redirect);

    // Act & Assert
    await expect(POST(requestWith({ endpoint: PHONE }))).rejects.toBe(redirect);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("알림 열쇠가 없으면 503을 돌려준다", async () => {
    // Arrange
    vi.mocked(getVapidConfig).mockReturnValue(undefined);

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "PUSH_NOT_CONFIGURED" });
    expect(createClient).not.toHaveBeenCalled();
  });

  // 공개 키만 넣으면 설정 화면은 알림 칸을 그리지만 보낼 수는 없다
  it("열쇠를 하나만 넣었으면 원인을 로그에 남기고 503을 돌려준다", async () => {
    // Arrange
    vi.mocked(getVapidConfig).mockImplementation(() => {
      throw new Error("환경 변수가 없습니다: VAPID_PRIVATE_KEY");
    });

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "PUSH_NOT_CONFIGURED" });
    expect(console.error).toHaveBeenCalledWith("시험 알림: 알림 열쇠 설정이 잘못됐습니다", "환경 변수가 없습니다: VAPID_PRIVATE_KEY");
  });

  it.each([
    ["본문이 없으면", undefined],
    ["구독 주소가 없으면", {}],
  ])("%s 400을 돌려준다", async (_, body) => {
    // Act
    const response = await POST(requestWith(body));

    // Assert
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_BODY" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("로그인한 사람의 구독 중 지금 기기에만 시험 알림을 보낸다", async () => {
    // Arrange
    const calls = fakeSupabase({ rows: [subscription(PHONE), subscription("https://push.example/tablet")] });
    const send = vi.fn<SendToSubscription>(() => Promise.resolve());
    useSender(send);

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ sentCount: 1 });
    expect(calls.filters).toEqual({ member_id: MEMBER_ID, endpoint: PHONE });
    expect(calls.selectedColumns).toBe("endpoint, p256dh, auth");
    expect(createWebPushSender).toHaveBeenCalledWith(VAPID);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith(subscription(PHONE), JSON.stringify(PUSH_TEST_MESSAGE));
    expect(calls.deletedEndpoints).toEqual([]);
  });

  // 다른 기기에 보내고 "보냈어요"라고 하면 이 기기가 알림을 못 받는 것을 놓친다
  it("서버에 지금 기기의 구독이 없으면 보내지 않고 409로 먼저 켜라고 알린다", async () => {
    // Arrange
    fakeSupabase({ rows: [subscription("https://push.example/tablet")] });
    const send = vi.fn<SendToSubscription>(() => Promise.resolve());
    useSender(send);

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ code: "PUSH_NOT_SUBSCRIBED", message: "이 기기에서 알림을 먼저 켜 주세요." });
    expect(send).not.toHaveBeenCalled();
  });

  it("구독을 읽지 못하면 502를 돌려준다", async () => {
    // Arrange
    fakeSupabase({ loadError: { message: "timeout" } });

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "PUSH_SUBSCRIPTIONS_LOAD_FAILED" });
  });

  it("알림 서비스가 사라졌다고 답하면 그 구독을 지우고 409로 다시 켜라고 알린다", async () => {
    // Arrange
    const calls = fakeSupabase({ rows: [subscription(PHONE)] });
    useSender(() => Promise.reject(pushError(410)));

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({ code: "PUSH_NOT_SUBSCRIBED" });
    expect(calls.deletedEndpoints).toEqual([PHONE]);
  });

  it("사라진 구독을 지우지 못해도 다시 켜라고 알리고 원인을 로그에 남긴다", async () => {
    // Arrange
    fakeSupabase({ rows: [subscription(PHONE)], deleteError: { message: "timeout" } });
    useSender(() => Promise.reject(pushError(404)));

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(409);
    expect(console.error).toHaveBeenCalledWith("시험 알림: 사라진 구독을 지우지 못했습니다", "timeout");
  });

  it("알림 서비스 장애로 보내지 못하면 구독은 두고 502를 돌려준다", async () => {
    // Arrange
    const calls = fakeSupabase({ rows: [subscription(PHONE)] });
    useSender(() => Promise.reject(pushError(500)));

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "PUSH_SEND_FAILED" });
    expect(calls.deletedEndpoints).toEqual([]);
    expect(console.error).toHaveBeenCalledWith(
      "시험 알림: 보내지 못한 기기가 있습니다",
      JSON.stringify({ sentCount: 0, failedCount: 1, expiredCount: 0, reasons: ["500"] }),
    );
  });

  // 실기기에서 "보내지 못했어요"만 보여 원인을 가를 수 없었다(#368). 알림 서비스가 답한 이유를 문구 뒤에 붙인다
  it("보내지 못하면 알림 서비스가 답한 이유를 문구에 붙인다", async () => {
    // Arrange
    fakeSupabase({ rows: [subscription(PHONE)] });
    useSender(() => Promise.reject(pushError(403, '{"reason":"BadJwtToken"}')));

    // Act
    const response = await POST(requestWith({ endpoint: PHONE }));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      code: "PUSH_SEND_FAILED",
      message: `${TEST_PUSH_FAILED_MESSAGE} (이유: 403 BadJwtToken)`,
    });
  });
});
