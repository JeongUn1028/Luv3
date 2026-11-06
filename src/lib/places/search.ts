/** 지도의 한 지점 */
export interface PlaceLocation {
  lat: number;
  lng: number;
}

/** 장소 찾기 결과 하나 */
export interface PlaceResult extends PlaceLocation {
  id: string;
  name: string;
  address: string;
}

const KAKAO_KEYWORD_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json";
/** 고르기 쉽도록 앞에 나온 것만 보여 준다 */
const PLACE_RESULT_LIMIT = 5;
/** 카카오가 답이 없을 때 화면이 "찾는 중"에 머물지 않게 이만큼만 기다린다 */
const PLACE_SEARCH_TIMEOUT_MS = 5000;

/** 장소 찾기 주소. 화면과 API 경로가 함께 쓴다 */
export const PLACE_SEARCH_PATH = "/api/places/search";

/** 장소를 찾지 못했을 때. 카카오의 상태 코드가 있으면 `status`에 담는다 */
export class PlaceSearchError extends Error {
  readonly status: number | undefined;

  constructor(options?: ErrorOptions & { status?: number }) {
    super("장소를 찾지 못했어요.", options);
    this.name = "PlaceSearchError";
    this.status = options?.status;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null;

// 빈 글자는 Number로 0이 되어 바다 한가운데 핀이 되므로 먼저 거른다
const isCoordinateText = (value: unknown): value is string => typeof value === "string" && value.trim() !== "";

const toKakaoPlace = (document: unknown): PlaceResult[] => {
  if (!isRecord(document)) return [];
  const { id, place_name: name, road_address_name: roadAddress, address_name: address, x, y } = document;
  if (typeof name !== "string" || name === "" || !isCoordinateText(x) || !isCoordinateText(y)) return [];
  const [lat, lng] = [Number(y), Number(x)];
  // 범위를 벗어난 좌표는 DB 제약에 걸려 사진까지 올린 뒤 저장이 실패하므로 고를 수 없게 한다. NaN도 여기서 걸러진다
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) return [];
  return [
    {
      id: typeof id === "string" ? id : `${y},${x}`,
      name,
      address: (typeof roadAddress === "string" && roadAddress) || (typeof address === "string" ? address : ""),
      lat,
      lng,
    },
  ];
};

/**
 * 카카오 키워드 검색 응답을 읽는다. x는 경도, y는 위도다. 이름이나 좌표가 잘못된 항목은 뺀다.
 *
 * @throws {PlaceSearchError} 응답 모양이 다를 때
 * @example parseKakaoPlaces({ documents: [{ place_name: "성수", x: "127.05", y: "37.54" }] })
 */
export const parseKakaoPlaces = (body: unknown): PlaceResult[] => {
  if (!isRecord(body) || !Array.isArray(body.documents)) throw new PlaceSearchError();
  return body.documents.flatMap(toKakaoPlace);
};

const isPlaceResult = (item: unknown): item is PlaceResult =>
  isRecord(item) &&
  typeof item.id === "string" &&
  typeof item.name === "string" &&
  typeof item.address === "string" &&
  typeof item.lat === "number" &&
  typeof item.lng === "number";

/**
 * 우리 API(`PLACE_SEARCH_PATH`)의 응답을 읽는다. 잘못된 항목은 뺀다.
 *
 * @throws {PlaceSearchError} 응답 모양이 다를 때
 * @example parsePlaceResults(await response.json())
 */
export const parsePlaceResults = (body: unknown): PlaceResult[] => {
  if (!isRecord(body) || !Array.isArray(body.items)) throw new PlaceSearchError();
  return body.items.filter(isPlaceResult);
};

/**
 * 카카오 키워드 장소 검색을 부른다. REST 키가 쓰이므로 서버에서만 부른다.
 *
 * @throws {PlaceSearchError} 연결이 끊겼거나, 답이 늦거나, 한도를 넘었거나(429), 응답이 잘못됐을 때
 * @example const places = await searchKakaoPlaces({ query: "성수", apiKey })
 */
export const searchKakaoPlaces = async ({
  query,
  apiKey,
  fetcher = fetch,
}: {
  query: string;
  apiKey: string;
  fetcher?: typeof fetch;
}): Promise<PlaceResult[]> => {
  const params = new URLSearchParams({ query, size: String(PLACE_RESULT_LIMIT) });
  const response = await fetcher(`${KAKAO_KEYWORD_SEARCH_URL}?${params.toString()}`, {
    headers: { Authorization: `KakaoAK ${apiKey}` },
    signal: AbortSignal.timeout(PLACE_SEARCH_TIMEOUT_MS),
  }).catch((cause: unknown) => {
    throw new PlaceSearchError({ cause });
  });
  if (!response.ok) throw new PlaceSearchError({ status: response.status });
  return parseKakaoPlaces(await response.json().catch((cause: unknown) => {
    throw new PlaceSearchError({ cause });
  }));
};
