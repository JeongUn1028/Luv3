import { describe, expect, it, vi } from "vitest";
import { fetchPlaceRegionName, PlaceRegionError } from "./region";

const SEONGSU = { lat: 37.5444, lng: 127.0396 };

const jsonResponse = (body: unknown, init?: ResponseInit): Response => Response.json(body, init);

describe("fetchPlaceRegionName", () => {
  it("우리 API에 위도·경도를 넘기고 이름을 받는다", async () => {
    // Arrange
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ name: "성동구 성수1가1동" }));

    // Act
    const name = await fetchPlaceRegionName({ location: SEONGSU, fetcher });

    // Assert
    expect(name).toBe("성동구 성수1가1동");
    expect(String(fetcher.mock.calls[0]?.[0])).toBe("/api/places/region?lat=37.5444&lng=127.0396");
  });

  it("이름이 없는 곳(null)이면 undefined를 돌려준다", async () => {
    // Arrange
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ name: null }));

    // Act & Assert
    await expect(fetchPlaceRegionName({ location: SEONGSU, fetcher })).resolves.toBeUndefined();
  });

  it("로그인 화면으로 넘어가거나 서버가 실패를 알리면 던진다", async () => {
    // Arrange
    const redirected = new Response("<html>");
    Object.defineProperty(redirected, "redirected", { value: true });
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(redirected).mockResolvedValueOnce(jsonResponse({ code: "X" }, { status: 502 }));

    // Act & Assert
    await expect(fetchPlaceRegionName({ location: SEONGSU, fetcher })).rejects.toBeInstanceOf(PlaceRegionError);
    await expect(fetchPlaceRegionName({ location: SEONGSU, fetcher })).rejects.toMatchObject({ status: 502 });
  });

  it("응답 모양이 다르면 던진다", async () => {
    // Arrange
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ name: 3 }));

    // Act & Assert
    await expect(fetchPlaceRegionName({ location: SEONGSU, fetcher })).rejects.toBeInstanceOf(PlaceRegionError);
  });

  // 답이 없으면 그 사진이 "위치 읽는 중"에 머물러 저장 버튼이 계속 막힌다
  it("답이 오래 없으면 요청을 끊도록 제한 시간 신호를 넘긴다", async () => {
    // Arrange
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(jsonResponse({ name: null }));

    // Act
    await fetchPlaceRegionName({ location: SEONGSU, fetcher });

    // Assert
    expect(fetcher.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("연결이 끊기면 원인을 담아 던진다", async () => {
    // Arrange
    const cause = new TypeError("fetch failed");
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(cause);

    // Act & Assert
    await expect(fetchPlaceRegionName({ location: SEONGSU, fetcher })).rejects.toMatchObject({ cause });
  });
});
