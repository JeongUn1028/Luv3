import { describe, expect, it, vi } from "vitest";
import { fetchPlaceResults, PlaceSearchError, parseKakaoPlaces, parsePlaceResults, searchKakaoPlaces, toPlaceSearchFailureNotice } from "./search";

const SEONGSU = {
  id: "1",
  place_name: "성수 카페",
  road_address_name: "서울 성동구 연무장길 1",
  address_name: "서울 성동구 성수동2가 1",
  x: "127.0561",
  y: "37.5445",
};
const RESULT = { id: "1", name: "성수 카페", address: "서울 성동구 연무장길 1", lat: 37.5445, lng: 127.0561 };

describe("parseKakaoPlaces", () => {
  it("x는 경도, y는 위도로 읽는다", () => {
    expect(parseKakaoPlaces({ documents: [SEONGSU] })).toEqual([RESULT]);
  });

  it("도로명 주소가 비어 있으면 지번 주소를 쓴다", () => {
    const [place] = parseKakaoPlaces({ documents: [{ ...SEONGSU, road_address_name: "" }] });
    expect(place?.address).toBe("서울 성동구 성수동2가 1");
  });

  it("이름이나 좌표가 잘못된 항목은 뺀다", () => {
    const documents = [{ ...SEONGSU, x: "모름" }, { ...SEONGSU, place_name: "" }, { ...SEONGSU, y: "" }, "글자"];
    expect(parseKakaoPlaces({ documents })).toEqual([]);
  });

  // 공백뿐인 이름을 사진 위치로 고르면 DB가 이름 없는 위치로 거부해 사진까지 올린 뒤 저장이 실패한다
  it("이름이 공백뿐인 항목은 뺀다", () => {
    expect(parseKakaoPlaces({ documents: [{ ...SEONGSU, place_name: "   " }] })).toEqual([]);
  });

  it("공백뿐인 좌표나 지구 범위를 벗어난 좌표는 뺀다", () => {
    const documents = [
      { ...SEONGSU, x: " " },
      { ...SEONGSU, y: " " },
      { ...SEONGSU, y: "91" },
      { ...SEONGSU, y: "-91" },
      { ...SEONGSU, x: "181" },
      { ...SEONGSU, x: "-181" },
    ];
    expect(parseKakaoPlaces({ documents })).toEqual([]);
  });

  it("모양이 다른 응답은 오류로 알린다", () => {
    expect(() => parseKakaoPlaces({ meta: {} })).toThrow(PlaceSearchError);
    expect(() => parseKakaoPlaces(undefined)).toThrow(PlaceSearchError);
  });
});

describe("parsePlaceResults", () => {
  it("우리 API의 응답을 읽고 잘못된 항목은 뺀다", () => {
    expect(parsePlaceResults({ items: [RESULT, { ...RESULT, lat: "37" }] })).toEqual([RESULT]);
  });

  it("모양이 다른 응답은 오류로 알린다", () => {
    expect(() => parsePlaceResults({ documents: [] })).toThrow(PlaceSearchError);
  });
});

describe("searchKakaoPlaces", () => {
  it("검색어를 주소에 맞게 넣고 REST 키로 부른다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json({ documents: [SEONGSU] }));

    // Act
    const places = await searchKakaoPlaces({ query: "성수 & 카페", apiKey: "키", fetcher });

    // Assert
    expect(places).toEqual([RESULT]);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const { origin, pathname, searchParams } = new URL(url);
    expect(`${origin}${pathname}`).toBe("https://dapi.kakao.com/v2/local/search/keyword.json");
    expect(searchParams.get("query")).toBe("성수 & 카페");
    expect(searchParams.get("size")).toBe("5");
    expect(init.headers).toEqual({ Authorization: "KakaoAK 키" });
  });

  it("응답이 실패면 상태 코드를 담아 오류로 알린다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => new Response("{}", { status: 429 }));

    // Act & Assert
    await expect(searchKakaoPlaces({ query: "성수", apiKey: "키", fetcher })).rejects.toMatchObject({
      name: "PlaceSearchError",
      status: 429,
    });
  });

  it("카카오가 답이 없으면 기다리지 않도록 제한 시간을 걸어 부른다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json({ documents: [] }));

    // Act
    await searchKakaoPlaces({ query: "성수", apiKey: "키", fetcher });

    // Assert
    const [, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("연결이 끊기면 오류로 알린다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });

    // Act & Assert
    await expect(searchKakaoPlaces({ query: "성수", apiKey: "키", fetcher })).rejects.toBeInstanceOf(PlaceSearchError);
  });
});

describe("fetchPlaceResults", () => {
  it("검색어를 우리 API 주소에 넣어 부르고 결과를 읽는다", async () => {
    // Arrange
    const fetcher = vi.fn(async () => Response.json({ items: [RESULT] }));

    // Act
    const places = await fetchPlaceResults({ query: "성수 & 카페", fetcher });

    // Assert
    expect(places).toEqual([RESULT]);
    expect(fetcher).toHaveBeenCalledWith("/api/places/search?q=%EC%84%B1%EC%88%98+%26+%EC%B9%B4%ED%8E%98");
  });

  it("로그인 화면으로 넘어가면 401로 알린다", async () => {
    // Arrange
    const redirected = new Response("<html></html>");
    Object.defineProperty(redirected, "redirected", { value: true });
    const fetcher = vi.fn(async () => redirected);

    // Act & Assert
    await expect(fetchPlaceResults({ query: "성수", fetcher })).rejects.toMatchObject({ status: 401 });
  });

  it("서버가 실패를 알리면 상태 코드를 담아 알린다", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 503 }));
    await expect(fetchPlaceResults({ query: "성수", fetcher })).rejects.toMatchObject({ status: 503 });
  });
});

describe("toPlaceSearchFailureNotice", () => {
  it("로그인이 풀렸으면 덧붙일 말 없이 다시 로그인하라고 알린다", () => {
    expect(toPlaceSearchFailureNotice(new PlaceSearchError({ status: 401 }), " 덧붙임.")).toBe("로그인한 뒤 다시 찾아 주세요.");
  });

  it("한도를 넘었거나 다른 이유로 실패하면 덧붙일 말을 붙인다", () => {
    expect([
      toPlaceSearchFailureNotice(new PlaceSearchError({ status: 429 }), " 덧붙임."),
      toPlaceSearchFailureNotice(new TypeError("연결 끊김")),
    ]).toEqual(["오늘은 장소를 더 찾을 수 없어요. 덧붙임.", "장소를 찾지 못했어요."]);
  });
});
