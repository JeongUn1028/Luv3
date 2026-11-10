import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const SECRET = "a".repeat(32);
const URL_PATH = "http://localhost/api/photo-cleanup";

const requestWith = (authorization?: string): Request =>
  new Request(URL_PATH, authorization ? { headers: { authorization } } : undefined);

describe("GET /api/photo-cleanup", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("서버에 CRON_SECRET이 없으면 어떤 값을 보내도 401을 돌려준다", async () => {
    // Arrange
    vi.stubEnv("CRON_SECRET", "");

    // Act
    const response = await GET(requestWith(`Bearer ${SECRET}`));

    // Assert
    expect(response.status).toBe(401);
  });

  it("비밀 값이 틀리면 지우기 전에 401을 돌려준다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);

    const response = await GET(requestWith(`Bearer ${"b".repeat(32)}`));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("SUPABASE_SECRET_KEY가 없으면 500과 설정이 없다는 코드를 돌려준다", async () => {
    vi.stubEnv("CRON_SECRET", SECRET);
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await GET(requestWith(`Bearer ${SECRET}`));

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toMatchObject({ code: "CLEANUP_NOT_CONFIGURED" });
  });
});
