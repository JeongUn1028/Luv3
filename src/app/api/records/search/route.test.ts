import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth/member";
import { RecordSearchLoadError, searchRecords } from "@/lib/dates/search-queries";
import { GET } from "./route";

vi.mock("@/lib/auth/member", () => ({ getCurrentMember: vi.fn() }));
vi.mock("@/lib/dates/search-queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dates/search-queries")>()),
  searchRecords: vi.fn(),
}));
vi.mock("server-only", () => ({}));

const PAGE = { items: [{ id: "a", date: "2026-11-02", endDate: undefined, title: "산책", place: undefined, tags: [], thumbUrl: undefined }], total: 1, next: undefined };

const requestWith = (search: string): Request => new Request(`http://localhost/api/records/search?${search}`);

describe("GET /api/records/search", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(getCurrentMember).mockReset();
    vi.mocked(searchRecords).mockReset();
  });

  it("멤버가 아니면 찾지 않고 멤버 확인의 이동을 그대로 따른다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    vi.mocked(getCurrentMember).mockRejectedValue(redirect);

    // Act & Assert
    await expect(GET(requestWith("q=성수"))).rejects.toBe(redirect);
    expect(searchRecords).not.toHaveBeenCalled();
  });

  it("찾은 묶음을 돌려주고 응답을 저장해 두지 않게 한다", async () => {
    // Arrange
    vi.mocked(searchRecords).mockResolvedValue(PAGE);

    // Act
    const response = await GET(requestWith(new URLSearchParams({ q: " 성수 ", tag: "카페" }).toString()));

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ items: [{ id: "a", date: "2026-11-02", title: "산책", tags: [] }], total: 1 });
    expect(searchRecords).toHaveBeenCalledWith({ query: "성수", tag: "카페", after: undefined });
  });

  it("조건이 잘못되면 찾지 않고 400을 돌려준다", async () => {
    // Act
    const response = await GET(requestWith("beforeDate=2026-11-02"));

    // Assert
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_QUERY" });
    expect(searchRecords).not.toHaveBeenCalled();
  });

  it("찾다 실패하면 검색어 없이 원인만 남기고 502를 돌려준다", async () => {
    // Arrange
    vi.mocked(searchRecords).mockRejectedValue(new RecordSearchLoadError({ cause: { code: "57014", message: "canceling statement" } }));

    // Act
    const response = await GET(requestWith("q=비밀"));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "RECORD_SEARCH_FAILED" });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("비밀");
  });

  it("정해 둔 실패가 아닌 에러는 그대로 던진다", async () => {
    // Arrange
    const unexpected = new TypeError("bug");
    vi.mocked(searchRecords).mockRejectedValue(unexpected);

    // Act & Assert
    await expect(GET(requestWith("q=성수"))).rejects.toBe(unexpected);
  });
});
