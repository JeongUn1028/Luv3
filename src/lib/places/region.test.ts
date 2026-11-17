import { describe, expect, it, vi } from "vitest";
import { createPlaceRegionNameReader, fetchPlaceRegionName, PlaceRegionError } from "./region";

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

describe("createPlaceRegionNameReader", () => {
  it("받은 이름은 기억해, 같은 곳이나 10m 안쪽 가까운 곳은 다시 묻지 않는다(#353)", async () => {
    // Arrange
    const fetchName = vi.fn().mockResolvedValue("성동구 성수1가1동");
    const readName = createPlaceRegionNameReader(fetchName);

    // Act
    const names = [await readName(SEONGSU), await readName(SEONGSU), await readName({ lat: 37.54442, lng: 127.03958 })];

    // Assert
    expect(names).toEqual(["성동구 성수1가1동", "성동구 성수1가1동", "성동구 성수1가1동"]);
    expect(fetchName).toHaveBeenCalledOnce();
  });

  it("경계 밖이라 이름이 없다는 답도 기억하고, 먼 곳은 따로 묻는다", async () => {
    // Arrange
    const fetchName = vi.fn().mockResolvedValueOnce(undefined).mockResolvedValueOnce("강남구 역삼1동");
    const readName = createPlaceRegionNameReader(fetchName);

    // Act
    const names = [await readName({ lat: 33, lng: 140 }), await readName({ lat: 33, lng: 140 }), await readName({ lat: 37.5, lng: 127.036 })];

    // Assert
    expect(names).toEqual([undefined, undefined, "강남구 역삼1동"]);
    expect(fetchName).toHaveBeenCalledTimes(2);
  });

  it("묻는 중인 곳을 또 물으면 같은 요청을 기다린다", async () => {
    // Arrange
    const fetchName = vi.fn().mockResolvedValue("성동구 성수1가1동");
    const readName = createPlaceRegionNameReader(fetchName);

    // Act
    const names = await Promise.all([readName(SEONGSU), readName(SEONGSU)]);

    // Assert
    expect(names).toEqual(["성동구 성수1가1동", "성동구 성수1가1동"]);
    expect(fetchName).toHaveBeenCalledOnce();
  });

  it("실패는 기억하지 않아 다음에 다시 묻는다", async () => {
    // Arrange
    const fetchName = vi.fn().mockRejectedValueOnce(new PlaceRegionError({ status: 500 })).mockResolvedValueOnce("성동구 성수1가1동");
    const readName = createPlaceRegionNameReader(fetchName);

    // Act
    const first = readName(SEONGSU);
    await expect(first).rejects.toBeInstanceOf(PlaceRegionError);
    const second = await readName(SEONGSU);

    // Assert
    expect(second).toBe("성동구 성수1가1동");
    expect(fetchName).toHaveBeenCalledTimes(2);
  });

  it("기억하는 곳이 너무 많아지면 가장 오래 쓰지 않은 곳부터 잊는다", async () => {
    // Arrange
    const fetchName = vi.fn().mockResolvedValue("어딘가");
    const readName = createPlaceRegionNameReader(fetchName, { maxSize: 2 });
    const [home, cafe, park] = [{ lat: 37.1, lng: 127.1 }, { lat: 37.2, lng: 127.2 }, { lat: 37.3, lng: 127.3 }];

    // Act: 집을 다시 써서 카페가 가장 오래 쓰지 않은 곳이 된 뒤 공원을 더한다
    await readName(home);
    await readName(cafe);
    await readName(home);
    await readName(park);
    await readName(home);
    await readName(cafe);

    // Assert: 집은 남고 카페만 다시 묻는다
    expect(fetchName.mock.calls.map((call: unknown[]) => call[0])).toEqual([home, cafe, park, cafe]);
  });
});
