import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentMember } from "@/lib/auth/member";
import { PlaceSearchError, searchKakaoPlaces } from "@/lib/places/search";
import { GET } from "./route";

vi.mock("@/lib/auth/member", () => ({ getCurrentMember: vi.fn() }));
vi.mock("@/lib/places/search", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/places/search")>()),
  searchKakaoPlaces: vi.fn(),
}));

const PLACE = { id: "1", name: "성수 카페", address: "서울 성동구 연무장길 1", lat: 37.5445, lng: 127.0561 };

const requestWith = (query: string): Request => new Request(`http://localhost/api/places/search?${new URLSearchParams({ q: query }).toString()}`);

describe("GET /api/places/search", () => {
  beforeEach(() => {
    vi.stubEnv("KAKAO_REST_API_KEY", "키");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.mocked(getCurrentMember).mockReset();
    vi.mocked(searchKakaoPlaces).mockReset();
  });

  it("멤버가 아니면 카카오를 부르지 않고 멤버 확인의 이동을 그대로 따른다", async () => {
    // Arrange
    const redirect = new Error("NEXT_REDIRECT");
    vi.mocked(getCurrentMember).mockRejectedValue(redirect);

    // Act & Assert
    await expect(GET(requestWith("성수"))).rejects.toBe(redirect);
    expect(searchKakaoPlaces).not.toHaveBeenCalled();
  });

  it("찾은 장소를 돌려주고 응답을 저장해 두지 않게 한다", async () => {
    // Arrange
    vi.mocked(searchKakaoPlaces).mockResolvedValue([PLACE]);

    // Act
    const response = await GET(requestWith(" 성수 "));

    // Assert
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ items: [PLACE] });
    expect(searchKakaoPlaces).toHaveBeenCalledWith({ query: "성수", apiKey: "키" });
  });

  it("서버에 키가 없으면 503을 돌려준다", async () => {
    // Arrange
    vi.stubEnv("KAKAO_REST_API_KEY", "");

    // Act
    const response = await GET(requestWith("성수"));

    // Assert
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ code: "PLACE_SEARCH_OFF" });
  });

  it("이모지 100개는 장소 칸에 적을 수 있는 길이이므로 찾는다", async () => {
    // Arrange
    vi.mocked(searchKakaoPlaces).mockResolvedValue([]);

    // Act
    const response = await GET(requestWith("😀".repeat(100)));

    // Assert
    expect(response.status).toBe(200);
  });

  it("장소 칸에 적을 수 없는 길이면 400을 돌려준다", async () => {
    // Act
    const response = await GET(requestWith("가".repeat(101)));

    // Assert
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ code: "INVALID_QUERY" });
    expect(searchKakaoPlaces).not.toHaveBeenCalled();
  });

  it("카카오 한도를 넘으면 429를 돌려준다", async () => {
    // Arrange
    vi.mocked(searchKakaoPlaces).mockRejectedValue(new PlaceSearchError({ status: 429 }));

    // Act
    const response = await GET(requestWith("성수"));

    // Assert
    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({ code: "PLACE_SEARCH_LIMIT" });
  });

  it("연결이 끊기면 502를 돌려주고, 로그에 원인을 남기되 검색어는 남기지 않는다", async () => {
    // Arrange
    vi.mocked(searchKakaoPlaces).mockRejectedValue(new PlaceSearchError({ cause: new TypeError("fetch failed") }));

    // Act
    const response = await GET(requestWith("비밀 장소"));

    // Assert
    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({ code: "PLACE_SEARCH_FAILED" });
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain("fetch failed");
    expect(logged).not.toContain("비밀 장소");
  });
});
