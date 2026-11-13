import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth/member";
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
const RECORD_ID = "10000000-0000-4000-8000-000000000001";
const COMMENT_ID = "20000000-0000-4000-8000-000000000001";
const EVENT_ID = "30000000-0000-4000-8000-000000000001";
const VAPID = { publicKey: "public", privateKey: "private" };

const subscription = (name: string): StoredPushSubscription => ({ endpoint: `https://push.example/${name}`, p256dh: "key", auth: "auth" });

const requestWith = (body: unknown): Request =>
  new Request("http://localhost/api/push/notify", { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });

interface FakeSupabaseOptions {
  /** 표마다 읽힐 행. 없으면 글이 없는 것이다 */
  rows?: Partial<Record<"dates" | "comments" | "events", Record<string, unknown>>>;
  loadError?: { message: string };
  claim?: unknown;
  claimError?: { message: string };
  deleteError?: { message: string };
}

/** 이 경로가 부르는 조회(from…select…eq…maybeSingle)와 함수 호출(rpc)만 흉내 내고, 받은 값을 기록한다 */
const fakeSupabase = ({ rows = {}, loadError, claim, claimError, deleteError }: FakeSupabaseOptions) => {
  const calls = { reads: [] as { table: string; columns: string; id: string }[], rpcs: [] as { name: string; args: unknown }[] };
  const client = {
    from: (table: "dates" | "comments" | "events") => ({
      select: (columns: string) => ({
        eq: (column: string, id: string) => {
          expect(column).toBe("id");
          calls.reads.push({ table, columns, id });
          return { maybeSingle: () => Promise.resolve(loadError ? { data: null, error: loadError } : { data: rows[table] ?? null, error: null }) };
        },
      }),
    }),
    rpc: (name: string, args: unknown) => {
      calls.rpcs.push({ name, args });
      if (name === "claim_partner_push") return Promise.resolve(claimError ? { data: null, error: claimError } : { data: claim, error: null });
      return Promise.resolve({ data: null, error: deleteError ?? null });
    },
  };
  vi.mocked(createClient).mockResolvedValue(client as unknown as Awaited<ReturnType<typeof createClient>>);
  return calls;
};

const RECORD_ROW = { date: "2026-11-12", title: "한강 피크닉" };
const ready = (...recipients: { badge: number; subscriptions: StoredPushSubscription[] }[]) => ({ status: "ready", recipients });

const useSender = (send: SendToSubscription) => {
  vi.mocked(createWebPushSender).mockReturnValue(send);
};

const pushError = (statusCode: number) => Object.assign(new Error("push failed"), { statusCode });

describe("POST /api/push/notify", () => {
  beforeEach(() => {
    vi.mocked(getCurrentMember).mockResolvedValue({ id: MEMBER_ID, nickname: "진아" });
    vi.mocked(getVapidConfig).mockReturnValue(VAPID);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.resetAllMocks();
    vi.restoreAllMocks();
  });

  it("멤버가 아니면 아무것도 읽지 않고 멤버 확인의 이동을 그대로 따른다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    vi.mocked(getCurrentMember).mockRejectedValue(redirect);

    // Act & Assert
    await expect(POST(requestWith({ kind: "record", id: RECORD_ID }))).rejects.toBe(redirect);
    expect(createClient).not.toHaveBeenCalled();
  });

  it("알림 열쇠가 없으면 503을 돌려준다", async () => {
    // Arrange
    vi.mocked(getVapidConfig).mockReturnValue(undefined);

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    expect(response.status).toBe(503);
    expect(createClient).not.toHaveBeenCalled();
  });

  it.each([
    ["본문이 없으면", undefined],
    ["모르는 종류면", { kind: "todo", id: RECORD_ID }],
    ["id가 uuid가 아니면", { kind: "record", id: "abc" }],
  ])("%s 400을 돌려준다", async (_, body) => {
    // Act
    const response = await POST(requestWith(body));

    // Assert
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_BODY" });
    expect(createClient).not.toHaveBeenCalled();
  });

  it("새 기록이면 상대의 기기마다 기록 알림과 올린 숫자를 보낸다", async () => {
    // Arrange
    const calls = fakeSupabase({ rows: { dates: RECORD_ROW }, claim: ready({ badge: 3, subscriptions: [subscription("phone"), subscription("tablet")] }) });
    const send = vi.fn<SendToSubscription>(() => Promise.resolve());
    useSender(send);

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ sentCount: 2 });
    expect(calls.reads).toEqual([{ table: "dates", columns: "date, title", id: RECORD_ID }]);
    expect(calls.rpcs).toEqual([{ name: "claim_partner_push", args: { p_kind: "record", p_target_id: RECORD_ID } }]);
    expect(createWebPushSender).toHaveBeenCalledWith(VAPID);
    const payload = JSON.stringify({ title: "진아님이 기록을 남겼어요", body: "11월 12일 · 한강 피크닉", url: `/dates/${RECORD_ID}`, badge: 3 });
    expect(send).toHaveBeenCalledWith(subscription("phone"), payload);
    expect(send).toHaveBeenCalledWith(subscription("tablet"), payload);
  });

  it("댓글이면 그 댓글이 달린 기록의 댓글로 가는 알림을 보낸다", async () => {
    // Arrange
    const calls = fakeSupabase({ rows: { comments: { date_id: RECORD_ID, content: "또 가자" } }, claim: ready({ badge: 1, subscriptions: [subscription("phone")] }) });
    const send = vi.fn<SendToSubscription>(() => Promise.resolve());
    useSender(send);

    // Act
    await POST(requestWith({ kind: "comment", id: COMMENT_ID }));

    // Assert
    expect(calls.reads).toEqual([{ table: "comments", columns: "date_id, content", id: COMMENT_ID }]);
    expect(send).toHaveBeenCalledWith(
      subscription("phone"),
      JSON.stringify({ title: "진아님의 댓글", body: "또 가자", url: `/dates/${RECORD_ID}#record-comments`, badge: 1 }),
    );
  });

  it("새 일정이면 캘린더의 그 날로 가는 알림을 보낸다", async () => {
    // Arrange
    const calls = fakeSupabase({
      rows: { events: { date: "2026-11-20", start_time: "19:00:00", title: "저녁 약속" } },
      claim: ready({ badge: 1, subscriptions: [subscription("phone")] }),
    });
    const send = vi.fn<SendToSubscription>(() => Promise.resolve());
    useSender(send);

    // Act
    await POST(requestWith({ kind: "event", id: EVENT_ID }));

    // Assert
    expect(calls.reads).toEqual([{ table: "events", columns: "date, start_time, title", id: EVENT_ID }]);
    expect(send).toHaveBeenCalledWith(
      subscription("phone"),
      JSON.stringify({ title: "진아님이 일정을 추가했어요", body: "11월 20일(금) 19:00 · 저녁 약속", url: "/calendar?month=2026-11&date=2026-11-20", badge: 1 }),
    );
  });

  it("확인을 통과한 뒤 읽을 때 글이 지워졌으면 보내지 않고 404를 돌려준다", async () => {
    // Arrange
    fakeSupabase({ claim: ready({ badge: 1, subscriptions: [subscription("phone")] }) });
    const send = vi.fn<SendToSubscription>(() => Promise.resolve());
    useSender(send);

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({ code: "PUSH_TARGET_NOT_FOUND" });
    expect(send).not.toHaveBeenCalled();
  });

  it("글을 읽지 못하면 502를 돌려준다", async () => {
    // Arrange
    fakeSupabase({ loadError: { message: "timeout" }, claim: ready({ badge: 1, subscriptions: [subscription("phone")] }) });

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "PUSH_TARGET_LOAD_FAILED" });
  });

  it.each([
    ["없는 글", "not-found", 404, "PUSH_TARGET_NOT_FOUND"],
    ["남이 쓴 글", "not-author", 403, "PUSH_NOT_AUTHOR"],
    ["오래된 글", "too-old", 409, "PUSH_TOO_OLD"],
    ["이미 알린 글", "already-sent", 409, "PUSH_ALREADY_SENT"],
    ["이 날만 고친 일정", "not-new", 409, "PUSH_NOT_NEW"],
  ])("%s이면 글을 읽지도 보내지도 않고 %s를 알린다", async (_, status, httpStatus, code) => {
    // Arrange
    const calls = fakeSupabase({ rows: { dates: RECORD_ROW }, claim: { status } });
    const send = vi.fn<SendToSubscription>(() => Promise.resolve());
    useSender(send);

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    expect(response.status).toBe(httpStatus);
    await expect(response.json()).resolves.toMatchObject({ code });
    expect(calls.reads).toEqual([]);
    expect(send).not.toHaveBeenCalled();
  });

  it.each([
    ["함수가 실패하면", { claimError: { message: "timeout" } }],
    ["답의 모양이 다르면", { claim: { status: "ready" } }],
  ])("보낼 곳을 확인하다 %s 502를 돌려준다", async (_, options) => {
    // Arrange
    fakeSupabase({ rows: { dates: RECORD_ROW }, ...options });

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "PUSH_CLAIM_FAILED" });
  });

  it("받을 사람이 없으면(상대가 꺼 둠) 보내지 않고 0을 돌려준다", async () => {
    // Arrange
    fakeSupabase({ rows: { dates: RECORD_ROW }, claim: ready() });
    const send = vi.fn<SendToSubscription>(() => Promise.resolve());
    useSender(send);

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    await expect(response.json()).resolves.toEqual({ sentCount: 0 });
    expect(send).not.toHaveBeenCalled();
  });

  it("알림 서비스가 사라졌다고 답한 기기만 지우고, 열쇠가 맞지 않음(403)·장애는 지우지 않는다", async () => {
    // Arrange
    const calls = fakeSupabase({
      rows: { dates: RECORD_ROW },
      claim: ready({ badge: 1, subscriptions: [subscription("phone"), subscription("gone"), subscription("forbidden"), subscription("down")] }),
    });
    const failures: Record<string, number> = { gone: 410, forbidden: 403, down: 500 };
    useSender(({ endpoint }) => {
      const status = failures[endpoint.replace("https://push.example/", "")];
      return status ? Promise.reject(pushError(status)) : Promise.resolve();
    });

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    await expect(response.json()).resolves.toEqual({ sentCount: 1 });
    expect(calls.rpcs[1]).toEqual({ name: "delete_push_subscriptions", args: { p_endpoints: ["https://push.example/gone"] } });
    expect(console.error).toHaveBeenCalledWith("상대 알림: 보내지 못한 기기가 있습니다", JSON.stringify({ sentCount: 1, failedCount: 2, expiredCount: 1 }));
  });

  it("사라진 구독을 지우지 못해도 보낸 결과를 돌려주고 원인을 로그에 남긴다", async () => {
    // Arrange
    fakeSupabase({ rows: { dates: RECORD_ROW }, claim: ready({ badge: 1, subscriptions: [subscription("gone")] }), deleteError: { message: "timeout" } });
    useSender(() => Promise.reject(pushError(404)));

    // Act
    const response = await POST(requestWith({ kind: "record", id: RECORD_ID }));

    // Assert
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ sentCount: 0 });
    expect(console.error).toHaveBeenCalledWith("상대 알림: 사라진 구독을 지우지 못했습니다", "timeout");
  });
});
